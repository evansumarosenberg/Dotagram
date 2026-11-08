"""Register the configured Telegram webhook using hidden, memory-only inputs."""
import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-url', required=True)
    parser.add_argument('--bot-id', required=True)
    parser.add_argument('--open-terminal', action='store_true', help='Open a visible Windows terminal after secure installer input.')
    args = parser.parse_args()
    if not sys.stdin.isatty():
        print('An interactive terminal is required for hidden input.')
        return 1
    if not re.fullmatch(r'https://[a-z0-9.-]+\.chatgpt\.site', args.site_url):
        print('Expected an HTTPS ChatGPT Site origin.')
        return 1
    secret = os.environ.pop('DOTAGRAM_INSTALL_WEBHOOK_SECRET', None)
    if secret is None:
        secret = getpass.getpass('Installer webhook secret (hidden): ')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', secret):
        print('Invalid webhook secret format.')
        return 1
    if args.open_terminal:
        if os.name != 'nt':
            print('Visible terminal launch requires Windows.')
            return 1
        child_env = os.environ.copy()
        child_env['DOTAGRAM_INSTALL_WEBHOOK_SECRET'] = secret
        child = subprocess.Popen([sys.executable, '-B', os.path.abspath(__file__),
            '--site-url', args.site_url, '--bot-id', args.bot_id],
            env=child_env, creationflags=subprocess.CREATE_NEW_CONSOLE)
        del child_env, secret
        print('Registration opened in a separate Windows console; enter the bot token there.', flush=True)
        return child.wait()
    token = getpass.getpass('Telegram bot token (hidden; not saved): ')
    if not re.fullmatch(r'[1-9][0-9]*:[A-Za-z0-9_-]+', token) or token.split(':')[0] != args.bot_id:
        print('Token does not match the configured bot. No API request made.')
        return 1
    opener = urllib.request.build_opener(NoRedirect())

    def api(method, payload):
        request = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method,
            data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        with opener.open(request, timeout=10) as response:
            raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError()
        result = json.loads(raw)
        if result.get('ok') is not True:
            raise ValueError()
        return result['result']

    submitted = False
    try:
        me = api('getMe', {})
        if me.get('is_bot') is not True or str(me.get('id')) != args.bot_id:
            raise ValueError()
        destination = args.site_url + '/telegram/webhook'
        before = api('getWebhookInfo', {})
        if before.get('url') and before['url'] != destination:
            print('A different webhook is already configured. It was left unchanged.')
            return 1
        submitted = True
        if api('setWebhook', {'url': destination, 'secret_token': secret,
            'allowed_updates': ['message', 'edited_message'], 'max_connections': 1,
            'drop_pending_updates': False}) is not True:
            raise ValueError()
        after = api('getWebhookInfo', {})
        verified = (after.get('url') == destination and after.get('max_connections') == 1
                    and set(after.get('allowed_updates', [])) == {'message', 'edited_message'})
        if not verified:
            raise ValueError()
        print('Webhook registered and configuration verified. Pending updates preserved.')
        print('Bot: @' + me['username'])
        print('URL:', destination)
        print('Allowed updates: message, edited_message; maximum connections: 1.')
        print('Group joining enabled:', me.get('can_join_groups', False))
        print('This verifies registration, not end-to-end delivery.')
        return 0
    except Exception:
        print('Registration outcome is uncertain; inspect configuration before retrying.' if submitted
              else 'Pre-registration check failed. Webhook was not changed.')
        print('No credentials or raw API responses were saved.')
        return 1


if __name__ == '__main__':
    visible_handoff = 'DOTAGRAM_INSTALL_WEBHOOK_SECRET' in os.environ
    result = main()
    if visible_handoff:
        input('Press Enter to close this registration window.')
    raise SystemExit(result)
