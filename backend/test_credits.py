"""Credit pricing from real token usage, and that guests and empty wallets cannot use billed chat."""
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from main import app
from routers import chat
from services import credits


class UsagePricingTests(unittest.TestCase):
    def test_no_usage_costs_nothing(self):
        self.assertEqual(credits.usage_credits([]), (0, 0))

    def test_cost_follows_tokens_and_model(self):
        cheap, tokens = credits.usage_credits([('gapgpt-qwen-3.6', 3000, 500)])
        heavy, _ = credits.usage_credits([('claude-sonnet-5-5', 20000, 1500)])
        self.assertEqual(tokens, 3500)
        self.assertGreaterEqual(cheap, 1)
        self.assertGreater(heavy, cheap * 10)

    def test_markup_is_applied(self):
        with patch.object(credits, 'MARKUP', 1.0):
            base, _ = credits.usage_credits([('claude-sonnet-5-5', 100000, 10000)])
        with patch.object(credits, 'MARKUP', 2.0):
            doubled, _ = credits.usage_credits([('claude-sonnet-5-5', 100000, 10000)])
        self.assertAlmostEqual(doubled / base, 2, delta=0.05)

    def test_usage_is_collected_per_request_bucket(self):
        bucket = credits.start_usage()
        credits.record_usage('gpt-5-mini', 100, 50)
        self.assertEqual(bucket, [('gpt-5-mini', 100, 50)])


class BilledChatGateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://backend')

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_guest_cannot_use_designer_chat(self):
        body = {'mode': 'designer', 'project_path': 'direct', 'messages': [{'role': 'user', 'content': 'hi'}]}
        response = await self.client.post('/api/chat', json=body)
        self.assertEqual(response.status_code, 401)

    async def test_empty_wallet_is_refused_before_any_ai_call(self):
        body = {'mode': 'designer', 'project_path': 'direct', 'messages': [{'role': 'user', 'content': 'hi'}]}
        with patch.object(chat, '_claims', return_value={'sub': 'c1', 'role': 'customer'}), patch.object(chat.credits, 'has_credits', AsyncMock(return_value=False)), patch.object(chat, 'analyze_lead', AsyncMock()) as analyze:
            response = await self.client.post('/api/chat', json=body)
        self.assertEqual(response.status_code, 402)
        analyze.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
