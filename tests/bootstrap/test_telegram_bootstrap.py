import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parents[2] / 'scripts' / 'telegram-bootstrap.py'
spec = importlib.util.spec_from_file_location('telegram_bootstrap', source)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


def message(text, **extra):
    return {'message': {'text': text, 'from': {'id': 456, 'is_bot': False},
                        'chat': {'id': 456, 'type': 'private'}, **extra}}


class BootstrapTests(unittest.TestCase):
    def test_start_plus_nonce_has_one_match(self):
        matches, counts = bootstrap.inspect_updates([message('/start'), message('synthetic-nonce')], 'synthetic-nonce')
        self.assertEqual(matches, [456])
        self.assertEqual(counts['updates'], 2)
        self.assertEqual(counts['eligible_nonce_messages'], 1)

    def test_empty_response_is_distinguishable(self):
        matches, counts = bootstrap.inspect_updates([], 'synthetic-nonce')
        self.assertEqual(matches, [])
        self.assertEqual(counts['updates'], 0)

    def test_duplicate_nonce_remains_ambiguous(self):
        matches, counts = bootstrap.inspect_updates([message('synthetic-nonce')] * 2, 'synthetic-nonce')
        self.assertEqual(len(matches), 2)
        self.assertEqual(counts['eligible_nonce_messages'], 2)

    def test_whitespace_is_diagnosed_without_relaxing_match(self):
        matches, counts = bootstrap.inspect_updates([message('synthetic-nonce\n')], 'synthetic-nonce')
        self.assertEqual(matches, [])
        self.assertEqual(counts['whitespace_only_differences'], 1)
        self.assertNotIn('synthetic-nonce', str(counts))

    def test_excluded_context_is_not_a_candidate(self):
        matches, counts = bootstrap.inspect_updates([message('synthetic-nonce', message_thread_id=1)], 'synthetic-nonce')
        self.assertEqual(matches, [])
        self.assertEqual(counts['exact_nonce_texts'], 1)


if __name__ == '__main__':
    unittest.main()
