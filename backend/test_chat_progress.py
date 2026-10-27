"""Actual server stages, per-request isolation and lifecycle of chat progress."""
import asyncio
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


if __name__ == '__main__':
    unittest.main()
