"""Actual server stages, per-request isolation and lifecycle of chat progress."""
import asyncio
import json
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

from main import app
from routers import chat
from lib.ai import analyze_lead as analysis


class ChatProgressTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        chat._chat_progress.clear()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://backend')

    async def asyncTearDown(self):
        await self.client.aclose()
        chat._chat_progress.clear()

    async def test_live_search_stage_and_completion_are_isolated(self):
        request_id = str(uuid.uuid4())
        started, finish = asyncio.Event(), asyncio.Event()

        async def analyze(*args, on_stage=None, **kwargs):
            on_stage('searching')
            started.set()
            await finish.wait()
            on_stage('thinking')
            return 'reply'

        with patch.object(chat, 'get_ai_settings', AsyncMock(return_value={})), patch.object(chat, 'analyze_lead', analyze):
            task = asyncio.create_task(self.client.post('/api/chat', json={'mode':'designer','project_path':'direct','progress_id':request_id,'messages':[{'role':'user','content':'hello'}]}))
            try:
                await asyncio.wait_for(started.wait(), timeout=2)
                result = await self.client.get('/api/chat/progress/'+request_id)
                self.assertEqual(result.json(), {'stage':'searching'})
                self.assertEqual(result.headers['cache-control'], 'no-store')
                other = await self.client.get('/api/chat/progress/'+str(uuid.uuid4()))
                self.assertEqual(other.status_code, 404)
            finally:
                finish.set()
            self.assertEqual((await task).status_code, 200)
        self.assertEqual((await self.client.get('/api/chat/progress/'+request_id)).json(), {'stage':'done'})

    async def test_failure_and_expiry(self):
        request_id = str(uuid.uuid4())
        with patch.object(chat, 'get_ai_settings', AsyncMock(side_effect=RuntimeError('synthetic failure'))), patch.object(chat.logger, 'error'):
            result = await self.client.post('/api/chat',json={'mode':'sales','progress_id':request_id,'messages':[]})
        self.assertEqual(result.status_code, 500)
        self.assertEqual((await self.client.get('/api/chat/progress/'+request_id)).json(), {'stage':'error'})
        chat._chat_progress[request_id] = ('searching', time.monotonic() - 601)
        self.assertEqual((await self.client.get('/api/chat/progress/'+request_id)).status_code, 404)

    async def test_search_is_reported_only_when_retrieval_runs(self):
        stages = []
        completion = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='reply'))]))
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))
        with patch.dict(analysis.os.environ, {'GAPGPT_API_KEY':'synthetic'}), patch.object(analysis,'retrieve_knowledge_async',AsyncMock(return_value='knowledge')) as retrieve, patch.object(analysis,'retrieve_skills',AsyncMock(return_value='')), patch.object(analysis,'_base_urls',return_value=['https://synthetic.test']), patch.object(analysis,'_model_order',return_value=['model']), patch.object(analysis,'AsyncOpenAI',return_value=client), patch.object(analysis,'parse_ai_response',return_value='reply'):
            await analysis.analyze_lead({}, [{'role':'user','content':'hello'}], 'designer', on_stage=stages.append)
            self.assertEqual(stages, ['thinking','searching','thinking'])
            retrieve.assert_awaited_once()
            stages.clear()
            retrieve.reset_mock()
            await analysis.analyze_lead({}, [{'role':'user','content':'hello'}], 'sales', on_stage=stages.append)
            self.assertNotIn('searching', stages)
            retrieve.assert_not_awaited()


class ModelIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def test_selected_chat_models_and_vision_routing(self):
        image = [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,test"}}]}]
        for model in (analysis.SONNET_MODEL, analysis.VISION_MODEL):
            self.assertIn(model, analysis.AVAILABLE_MODELS)
            self.assertEqual(analysis._model_order(model, []), [model])
            self.assertEqual(analysis._model_order(model, image), [model])
        self.assertEqual(analysis._model_order(analysis.DEFAULT_MODEL, image), [analysis.VISION_MODEL])
        self.assertNotIn(analysis.STRUCTURED_MODEL, analysis.AVAILABLE_MODELS)

    def test_mode_specific_models_and_legacy_fallback(self):
        settings = {"ai_model": analysis.DEFAULT_MODEL, "designer_ai_model": analysis.SONNET_MODEL}
        self.assertEqual(analysis.selected_chat_model(settings, "designer"), analysis.SONNET_MODEL)
        self.assertEqual(analysis.selected_chat_model(settings, "sales"), analysis.DEFAULT_MODEL)
        self.assertEqual(analysis.selected_chat_model({"ai_model": analysis.VISION_MODEL}, "designer"), analysis.VISION_MODEL)
        self.assertEqual(analysis.selected_chat_model({"ai_model": "unsupported"}, "sales"), analysis.DEFAULT_MODEL)

    async def test_public_model_metadata_exposes_only_mode_models(self):
        from fastapi import Response
        from routers import settings as settings_router
        response = Response()
        configured = {"ai_model": analysis.DEFAULT_MODEL, "designer_ai_model": analysis.SONNET_MODEL, "private_setting": "never expose"}
        with patch.object(settings_router, "get_ai_settings", AsyncMock(return_value=configured)):
            result = await settings_router.public_chat_models(response, None)
        self.assertEqual(set(result), {"designer", "sales"})
        self.assertEqual(result["designer"], {"id": analysis.SONNET_MODEL, "label": "Claude Sonnet 5.5"})
        self.assertEqual(result["sales"]["id"], analysis.DEFAULT_MODEL)
        self.assertNotIn("private_setting", json.dumps(result))
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_gpt_mini_parameters_and_mode_selection(self):
        model = analysis.GPT_MINI_MODEL
        self.assertIn(model, analysis.AVAILABLE_MODELS)
        self.assertEqual(analysis.MODEL_LABELS[model], "GPT-5 mini")
        self.assertEqual(analysis.selected_chat_model({"ai_model": model}, "sales"), model)
        self.assertEqual(analysis.selected_chat_model({"designer_ai_model": model}, "designer"), model)
        for budget in (2000, 6000):
            params = analysis._completion_parameters(model, budget, 0.25)
            self.assertNotIn("temperature", params)
            self.assertNotIn("max_tokens", params)
            self.assertEqual(params["extra_body"], {"max_completion_tokens": budget, "reasoning_effort": "minimal"})
        self.assertEqual(analysis._completion_parameters(analysis.SONNET_MODEL, 2000, 0.25), {"max_tokens": 2000, "temperature": 0.25})

    async def assess(self, payload, status=200):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(status, json=payload)
        original_client = httpx.AsyncClient
        lead = json.dumps({"lead_score": 50, "client_risk_level": "low", "client_message": "Original reply", "extra": "preserved"})
        with patch.dict(analysis.os.environ, {"GAPGPT_API_KEY": "synthetic"}), patch.object(analysis, "_base_urls", return_value=["https://synthetic.test/v1"]), patch.object(analysis.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs)):
            result = await analysis.evaluate_sales_lead(lead, [{"role": "user", "content": "Synthetic project"}], {"structured_analysis_model": analysis.STRUCTURED_MODEL})
        return lead, result, requests

    async def test_jev_endpoint_payload_and_schema_preservation(self):
        original, result, requests = await self.assess({"answers": {"client_risk_level": {"choice": "medium"}, "lead_score": {"score": 3.2}}})
        self.assertEqual(str(requests[0].url), "https://synthetic.test/v1/systemone")
        body = json.loads(requests[0].content)
        self.assertEqual(body["model"], analysis.STRUCTURED_MODEL)
        self.assertEqual(body["questions"]["lead_score"]["type"], "score")
        parsed = json.loads(result)
        self.assertEqual(parsed["lead_score"], 80)
        self.assertEqual(parsed["client_risk_level"], "medium")
        self.assertEqual(parsed.keys(), json.loads(original).keys())
        self.assertEqual(parsed["client_message"], "Original reply")
        self.assertEqual(parsed["extra"], "preserved")

    async def test_jev_failure_or_invalid_answer_preserves_analysis(self):
        for payload, status in [({}, 401), ({}, 500), ({"answers": {}}, 200), ({"answers": {"client_risk_level": {"choice": "high"}, "lead_score": {"score": 100}}}, 200)]:
            original, result, _ = await self.assess(payload, status)
            self.assertEqual(result, original)

    async def test_jev_does_not_run_for_disabled_or_conversational_reply(self):
        with patch.object(analysis.httpx, "AsyncClient") as client:
            self.assertEqual(await analysis.evaluate_sales_lead("hello", [], {"structured_analysis_model": analysis.STRUCTURED_MODEL}), "hello")
            self.assertEqual(await analysis.evaluate_sales_lead("{}", [], {}), "{}")
            client.assert_not_called()


if __name__ == '__main__':
    unittest.main()
