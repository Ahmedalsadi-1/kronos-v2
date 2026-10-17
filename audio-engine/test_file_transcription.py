import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

BASE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("stt_under_test", BASE / "stt_engine.py")
stt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stt)


class FileTranscriptionTests(unittest.TestCase):
    def test_segments_keep_real_timestamps_and_skip_silence(self):
        engine = stt.STTEngine(device="cpu")
        model = Mock()
        model.transcribe.return_value = (
            iter([SimpleNamespace(start=1.25, end=3.5, text=" Hello "), SimpleNamespace(start=4, end=5, text=" ")]),
            SimpleNamespace(language="en"),
        )
        with tempfile.NamedTemporaryFile(suffix=".wav") as file:
            with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=Mock(return_value=model))}):
                result = engine.transcribe_file_segments(file.name)
                self.assertEqual(result, {"segments": [{"start": 1.25, "end": 3.5, "text": "Hello"}], "language": "en"})
                sys.modules["faster_whisper"].WhisperModel.assert_called_once_with("base", device="cpu", compute_type="int8", local_files_only=True)

    def test_missing_cached_model_never_allows_a_download(self):
        engine = stt.STTEngine(device="cpu")
        factory = Mock(side_effect=FileNotFoundError("cache miss"))
        with tempfile.NamedTemporaryFile(suffix=".wav") as file:
            with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=factory)}):
                with self.assertRaisesRegex(RuntimeError, "No model was downloaded"):
                    engine.transcribe_file_segments(file.name)
                self.assertTrue(factory.call_args.kwargs["local_files_only"])

    def test_invalid_or_remote_paths_rejected_before_model_access(self):
        engine = stt.STTEngine(device="cpu")
        for value in [None, "https://example.com/audio.wav", "relative.wav", "/not-found-kronterm-audio.wav"]:
            with self.assertRaises(ValueError):
                engine.transcribe_file_segments(value)
        self.assertFalse(engine.is_available())

    def test_rpc_preserves_request_identity_and_seconds(self):
        modules = {"audio_capture": SimpleNamespace(AudioCapture=Mock()), "stt_engine": stt, "tts_engine": SimpleNamespace(TTSEngine=Mock())}
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location("voice_under_test", BASE / "main.py")
            main = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(main)
        engine = main.VoiceEngine.__new__(main.VoiceEngine)
        expected = {"segments": [{"start": 2, "end": 3, "text": "Speech"}], "language": "en"}
        engine.stt = SimpleNamespace(transcribe_file_segments=Mock(return_value=expected))
        engine._send_result = Mock()
        engine._send_error = Mock()
        engine.handle_request({"id": 42, "method": "transcribe_file", "params": {"path": "/tmp/selected.wav"}})
        engine._send_result.assert_called_once_with(42, expected)
        engine._send_error.assert_not_called()


if __name__ == "__main__":
    unittest.main()
