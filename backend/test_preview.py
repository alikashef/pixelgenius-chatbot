"""Regression checks for the shared static/full-stack public domain gateway."""
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from main import app
from routers import site_mcp
from services import liara


class PreviewDomainTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.static = root / 'sites'
        self.dynamic = root / 'liara'
        self.static.mkdir()
        self.dynamic.mkdir()
        self.patches = [
            patch.object(site_mcp, 'SITES_DIR', self.static),
            patch.object(liara, 'META_DIR', self.dynamic),
            patch.object(site_mcp, 'PREVIEW_BASE_DOMAIN', 'preview.pixelgenius.ir'),
            patch.object(site_mcp, 'PREVIEW_URL_TEMPLATE', 'https://{slug}.preview.pixelgenius.ir'),
        ]
        for item in self.patches:
            item.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://backend')
        self.order_id = 'qa-project'
        self.slug = site_mcp.slug_for_order(self.order_id)
        self.name = liara.app_name_for_slug(self.slug)
        self.domain = self.slug + '.preview.pixelgenius.ir'
        self.public_url = 'https://' + self.domain
        self.token = site_mcp.make_deploy_info(self.order_id)['token']

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def metadata(self, **changes):
        value = {'app': self.name, 'release_id': 'qa-release', 'expires_at': int(time.time()) + 600, **changes}
        liara.write_meta(self.slug, value)
        return value

    async def test_static_and_full_stack_share_public_url(self):
        result = site_mcp._tool_publish({'token': self.token, 'files': [{'path': 'index.html', 'content': '<h1>Pixel</h1>'}]})
        self.assertEqual(result['url'], self.public_url)
        self.assertEqual(site_mcp._tool_get({'token': self.token})['url'], self.public_url)
        response = await self.client.get('/api/preview/route', params={'domain': self.domain})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.headers['x-preview-kind'], 'static')
        self.assertNotIn('x-preview-upstream', response.headers)
        response = await self.client.get('/api/preview/allow', params={'domain': self.domain})
        self.assertEqual(response.status_code, 200)
        self.metadata()
        with patch.object(liara, 'release_status', AsyncMock(return_value={
            'state': 'READY', 'queue': None, 'fail_reason': None, 'build_log_tail': [],
        })), patch.object(liara, 'project_details', AsyncMock()) as details:
            status = await site_mcp._tool_deploy_status({'token': self.token})
        self.assertEqual(status['url'], result['url'])
        details.assert_not_awaited()

    async def test_dynamic_route_and_certificate_gate(self):
        self.metadata()
        with patch.object(site_mcp, '_origin_url', AsyncMock(return_value=self.name + '.liara.run')) as origin:
            for _ in range(2):
                response = await self.client.get('/api/preview/route', params={'domain': self.domain})
                self.assertEqual(response.status_code, 204)
                self.assertEqual(response.headers['x-preview-upstream'], self.name + '.liara.run')
                self.assertEqual(response.headers['x-preview-kind'], 'dynamic')
            origin.assert_awaited_once()
        response = await self.client.get('/api/preview/allow', params={'domain': self.domain})
        self.assertEqual(response.status_code, 200)

    async def test_missing_expired_and_unready_projects(self):
        for domain in [self.domain, 'bad.' + self.domain, self.domain + '.evil.test', 'preview.pixelgenius.ir']:
            response = await self.client.get('/api/preview/allow', params={'domain': domain})
            self.assertEqual(response.status_code, 404)
        self.metadata(expires_at=int(time.time()) - 1)
        response = await self.client.get('/api/preview/route', params={'domain': self.domain})
        self.assertEqual(response.status_code, 410)
        response = await self.client.get('/api/preview/allow', params={'domain': self.domain})
        self.assertEqual(response.status_code, 404)
        self.metadata(release_id=None)
        response = await self.client.get('/api/preview/route', params={'domain': self.domain})
        self.assertEqual(response.status_code, 503)
        self.assertIn('retry-after', response.headers)

    async def test_arbitrary_proxy_targets_are_rejected(self):
        self.metadata(upstream_host='127.0.0.1')
        with patch.object(site_mcp, '_origin_url', AsyncMock(return_value='evil.example')):
            response = await self.client.get('/api/preview/route', params={'domain': self.domain}, headers={'X-Preview-Upstream': 'evil.example'})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('x-preview-upstream', response.headers)

    async def test_old_workspace_and_admin_links_are_canonicalized(self):
        old = 'https://' + self.name + '.liara.run/admin?next=/catalog#users'
        expected = self.public_url + '/admin?next=/catalog#users'
        self.assertEqual(site_mcp.canonical_project_url(self.order_id, old), expected)
        self.assertEqual(site_mcp.canonical_project_url(self.order_id, 'https://another.liara.run/admin'), 'https://another.liara.run/admin')
        data = {'versions': [{'url': old}], 'deployments': [{'url': old}]}
        site_mcp.canonicalize_workspace_urls(self.order_id, data)
        self.assertEqual(data['versions'][0]['url'], expected)
        self.assertEqual(data['deployments'][0]['url'], expected)

    async def test_admin_sites_require_admin_and_hide_private_metadata(self):
        from auth import create_access_token
        self.metadata(database='private-db', password='hidden', env={'TOKEN': 'hidden'})
        url = '/api/admin/sites'
        self.assertIn((await self.client.get(url)).status_code, (401, 403))
        customer = create_access_token({'sub': 'customer', 'role': 'customer'})
        self.assertEqual((await self.client.get(url, headers={'Authorization': 'Bearer '+customer})).status_code, 403)
        admin = create_access_token({'sub': 'admin', 'role': 'admin'})
        with patch.object(liara, 'release_status', AsyncMock(return_value={'state': 'READY'})):
            response = await self.client.get(url, headers={'Authorization': 'Bearer '+admin})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['sites'][0]['state'], 'READY')
        self.assertNotIn('hidden', response.text)
        self.assertNotIn('private-db', response.text)

    async def test_admin_extend_and_remote_delete_failure_can_be_retried(self):
        from auth import create_access_token
        headers = {'Authorization': 'Bearer '+create_access_token({'sub': 'admin', 'role': 'admin'})}
        meta = self.metadata(database='qa-db')
        url = f'/api/admin/sites/dynamic/{self.slug}'
        response = await self.client.post(url+'/extend', json={'hours': 24}, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(liara.read_meta(self.slug)['expires_at'], meta['expires_at']+86400)
        for hours in (0, -1, 8761, 1.5, True):
            self.assertEqual((await self.client.post(url+'/extend', json={'hours': hours}, headers=headers)).status_code, 422)
        with patch.object(liara, 'delete_app', AsyncMock()) as app_delete, patch.object(liara, 'delete_database', AsyncMock(side_effect=liara.LiaraError('failed'))):
            response = await self.client.delete(url, headers=headers)
            self.assertEqual(response.status_code, 502)
            app_delete.assert_awaited_once_with(self.name)
            self.assertIsNotNone(liara.read_meta(self.slug))
        with patch.object(liara, 'delete_app', AsyncMock()), patch.object(liara, 'delete_database', AsyncMock()) as db_delete:
            self.assertEqual((await self.client.delete(url, headers=headers)).status_code, 200)
            db_delete.assert_awaited_once_with('qa-db')
        self.assertIsNone(liara.read_meta(self.slug))
        self.assertEqual((await self.client.get('/api/preview/route', params={'domain': self.domain})).status_code, 404)

    async def test_static_admin_extension_and_delete(self):
        from auth import create_access_token
        headers = {'Authorization': 'Bearer '+create_access_token({'sub': 'admin', 'role': 'admin'})}
        self.static.joinpath(self.slug).mkdir()
        self.static.joinpath(self.slug, '.meta.json').write_text('{"expires_at": 1, "files": ["index.html"]}')
        url = f'/api/admin/sites/static/{self.slug}'
        response = await self.client.post(url+'/extend', json={'hours': 2}, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.json()['expires_at'], time.time()+7100)
        self.assertEqual((await self.client.delete(url, headers=headers)).status_code, 200)
        self.assertFalse(self.static.joinpath(self.slug).exists())


if __name__ == '__main__':
    unittest.main()
