import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("packs", Path(__file__).with_name("import-workflow-pack.py"))
packs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packs)


class WorkflowImportTests(unittest.TestCase):
    def test_workflow_keeps_references_but_excludes_executable_manifests(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "productivity"
            (source / "skills" / "start").mkdir(parents=True)
            (source / "skills" / "start" / "SKILL.md").write_text("Read ../../CONNECTORS.md")
            (source / "skills" / "dashboard.html").write_text("<html>dashboard</html>")
            (source / "LICENSE").write_text("fixture license")
            (source / "CONNECTORS.md").write_text("optional connectors")
            (source / ".mcp.json").write_text('{"command":"execute"}')
            (source / "hooks").mkdir()
            (source / "hooks" / "start.sh").write_text("exit 1")
            target = root / "result"
            packs.stage_pack("productivity", root, target)
            self.assertTrue((target / "upstream/skills/dashboard.html").exists())
            self.assertTrue((target / "upstream/CONNECTORS.md").exists())
            self.assertFalse((target / "upstream/.mcp.json").exists())
            self.assertFalse((target / "upstream/hooks").exists())
            self.assertIn("explicitly invokes", (target / "SKILL.md").read_text())
            self.assertIn("upstream/skills/start/SKILL.md", (target / "SKILL.md").read_text())
            provenance = json.loads((target / "kronterm-provenance.json").read_text())
            self.assertEqual(provenance["revision"], packs.PACKS["productivity"][1])
            self.assertFalse(provenance["importedConnectors"])

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            source.mkdir()
            (source / "escape").symlink_to(root)
            with self.assertRaisesRegex(ValueError, "symlink"):
                packs.copy_content(source, root / "target")

    def test_existing_install_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "diagram-design").mkdir()
            with self.assertRaisesRegex(ValueError, "Already exists"):
                packs.import_pack("diagram-design", root)

    def test_missing_skill_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "skills/diagram-design").mkdir(parents=True)
            (root / "LICENSE").write_text("fixture")
            with self.assertRaisesRegex(ValueError, "missing"):
                packs.stage_pack("diagram-design", root, root / "result")


if __name__ == "__main__":
    unittest.main()
