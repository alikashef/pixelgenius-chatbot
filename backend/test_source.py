"""Checks for GitHub and bounded ZIP source intake without executing uploaded code."""
import io
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

import httpx

from main import app
from routers import chat
from schemas import HandoffProposalIn, OrderCreateIn


def archive_bytes(files):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w', compression=ZIP_DEFLATED) as archive:
        for name, content in files:
            archive.writestr(name, content)
    return buffer.getvalue()


class SourceIntakeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.uploads = self.root / 'chat-files'
        self.uploads.mkdir()
        self.patches = [patch.object(chat, 'UPLOAD_ROOT', self.root), patch.object(chat, 'CHAT_UPLOAD_DIR', self.uploads)]
        for item in self.patches:
            item.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://backend')

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches):
            item.stop()
        self.folder.cleanup()

    async def upload(self, content):
        return await self.client.post('/api/chat/files', files={'file': ('source.zip', content, 'application/zip')})

    async def test_github_source_and_missing_source(self):
        with patch.object(chat, 'get_ai_settings', AsyncMock(return_value={})), patch.object(chat, 'analyze_lead', AsyncMock(return_value='ok')) as analyze:
            base = {'mode': 'designer', 'project_path': 'source', 'messages': [{'role': 'user', 'content': 'deploy'}]}
            response = await self.client.post('/api/chat', json=base)
            self.assertEqual(response.status_code, 422)
            analyze.assert_not_awaited()
            response = await self.client.post('/api/chat', json={**base, 'source_type': 'github', 'source_url': 'https://github.com/example/project'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(analyze.call_args.args[0]['project_source_type'], 'github')
            response = await self.client.post('/api/chat', json={**base, 'source_type': 'github', 'source_url': 'https://evil.test/example/project'})
            self.assertEqual(response.status_code, 422)

    async def test_zip_upload_and_ai_context(self):
        content = archive_bytes([('project/package.json', '{"dependencies":{"next":"14"}}'), ('project/README.md', 'Run npm run build'), ('project/.env', 'SECRET=must-not-reach-ai'), ('project/main.py', 'raise RuntimeError("do not execute")')])
        response = await self.upload(content)
        self.assertEqual(response.status_code, 200, response.text)
        source = response.json()
        with patch.object(chat, 'get_ai_settings', AsyncMock(return_value={})), patch.object(chat, 'analyze_lead', AsyncMock(return_value='ok')) as analyze:
            response = await self.client.post('/api/chat', json={'mode':'designer','project_path':'source','source_type':'zip','source_file':source,'messages':[{'role':'user','content':'deploy my source'}]})
            self.assertEqual(response.status_code, 200, response.text)
            context = analyze.call_args.args[1][-1]['content']
            self.assertIn('package.json', context)
            self.assertIn('"next":"14"', context)
            self.assertIn('Run npm run build', context)
            self.assertNotIn('must-not-reach-ai', context)
            self.assertEqual(analyze.call_args.args[0]['project_source_type'], 'zip')
        # The full attachment reference survives both direct submission and OTP handoff.
        proposal = HandoffProposalIn(type='proposal',projectName='test',summary='test',features=[],tech='Next.js',days=1,price=0,priceLabel='-',mode='designer',project_path='source',source_type='zip',source_file=source)
        self.assertEqual(proposal.model_dump()['source_file']['id'], source['id'])
        order = OrderCreateIn(project_name='test',summary='test',features=[],tech_stack='Next.js',delivery_days=1,price_estimate=0,price_label='-',mode='designer',project_path='source',source_type='zip',source_file=source)
        self.assertEqual(order.source_file.url, source['url'])

    async def test_invalid_or_unsafe_archives_are_rejected_and_removed(self):
        link = ZipInfo('link')
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        inputs = [b'not a ZIP', archive_bytes([('../escape.txt', 'bad')]), archive_bytes([(link, '/etc/passwd')]), archive_bytes([('large.txt', b'a' * (12 * 1024 * 1024 + 1))]), archive_bytes([(f'{i}.txt', 'x') for i in range(401)])]
        for content in inputs:
            response = await self.upload(content)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(list(self.uploads.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
