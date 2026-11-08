"""Installation-only, read-only Telegram verification. Never used by the Worker."""
import argparse
import getpass
import json
import re
import sys
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def inspect_updates(updates, nonce):
    """Return only candidate IDs and counts; never diagnostics containing text."""
    matches = []
    counts = {'updates': len(updates), 'private_human_texts': 0,
              'exact_nonce_texts': 0, 'whitespace_only_differences': 0,
              'eligible_nonce_messages': 0}
    for update in updates:
        message = update.get('message', {})
        sender, chat = message.get('from', {}), message.get('chat', {})
        identity, text = sender.get('id'), message.get('text')
        exact = text == nonce
        if exact:
            counts['exact_nonce_texts'] += 1
        elif isinstance(text, str) and text.strip() == nonce:
            counts['whitespace_only_differences'] += 1
        eligible = (chat.get('type') == 'private' and sender.get('is_bot') is False
                    and type(identity) is int and 0 < identity <= 9007199254740991
                    and chat.get('id') == identity and isinstance(text, str)
                    and not any(key in message for key in (
                        'business_connection_id', 'sender_business_bot', 'sender_chat',
                        'message_thread_id', 'direct_messages_topic'))
                    and not message.get('is_topic_message'))
        if eligible:
            counts['private_human_texts'] += 1
            if exact:
                matches.append(identity)
    counts['eligible_nonce_messages'] = len(matches)
    return matches, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--nonce', required=True, help='Non-secret verification text sent by the owner')
    args = parser.parse_args()
    if not sys.stdin.isatty():
        print('Run in an interactive terminal so token input remains hidden.')
        return 1
    token = getpass.getpass('Telegram bot token (hidden; not saved): ')
    if not re.fullmatch(r'[1-9][0-9]*:[A-Za-z0-9_-]+', token):
        print('Invalid token format. No API request made.')
        return 1
    opener = urllib.request.build_opener(NoRedirect())

    def api(method, payload):
        request = urllib.request.Request(
            'https://api.telegram.org/bot' + token + '/' + method,
            data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'}, method='POST')
        with opener.open(request, timeout=10) as response:
            body = response.read(262145)
        if len(body) > 262144:
            raise ValueError('bounded response exceeded')
        result = json.loads(body)
        if result.get('ok') is not True:
            raise ValueError('API rejected request')
        return result['result']

    try:
        me = api('getMe', {})
        if me.get('is_bot') is not True or str(me.get('id')) != token.split(':')[0]:
            raise ValueError('bot identity mismatch')
        print('Token belongs to bot: @' + me.get('username', '(unavailable)'))
        webhook = api('getWebhookInfo', {})
        if webhook.get('url'):
            print('This bot already has a webhook. It was left unchanged; resume with the installer.')
            return 1
        updates = api('getUpdates', {'timeout': 0, 'limit': 100, 'allowed_updates': ['message']})
        matches, counts = inspect_updates(updates, args.nonce)
        if len(matches) != 1:
            print('No eligible nonce message found.' if not matches else
                  'Multiple eligible nonce messages found; verification is ambiguous.')
            print('Diagnostic counts:', json.dumps(counts, sort_keys=True))
            if len(updates) == 100:
                print('The pending-update page is full. No updates were acknowledged or discarded.')
            print('No configuration saved. Share the bot username and diagnostic counts with the installer, not your token.')
            return 1
        fields = ['id', 'is_bot', 'first_name', 'username', 'can_join_groups',
                  'can_read_all_group_messages', 'supports_inline_queries',
                  'can_connect_to_business', 'has_main_web_app', 'has_topics_enabled',
                  'allows_users_to_create_topics', 'can_manage_bots', 'supports_join_request_queries']
        result = {'bot_info': {key: me[key] for key in fields if key in me},
                  'candidate_owner_user_id': str(matches[0]), 'nonce_matched': True}
        destination = Path(__file__).resolve().parent.parent / 'outputs' / 'telegram-bootstrap.json'
        destination.parent.mkdir(exist_ok=True)
        destination.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('Verified bot ID:', me['id'])
        print('Candidate human-owner ID:', matches[0])
        print('Nonce matched. Confirm with the installer that you sent it from your intended account.')
        print('Non-secret configuration saved to:', destination)
        return 0
    except Exception:
        # HTTP exceptions can contain the token-bearing URL. Never print them.
        print('Verification failed. No token or raw API response was saved. Check connectivity/token and retry.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
