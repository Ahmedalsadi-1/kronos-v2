import { nativeToolManifest } from "../mcp-kron-term/dist/index.js";
import { groupKronTermTools, KronTermToolFamilies } from "../mcp-kron-term/dist/tool-families.js";

const manifest = nativeToolManifest(() => true);
const groups = groupKronTermTools(manifest.map((tool) => tool.name));
console.log("# KronTerm capability inventory\n");
console.log("Source: enabled registrations in the built MCP/native manifest. Rebuild before running.\n");
console.log(
  "| Family | Registered | Advertised in unfiltered manifest | Permitted | Executable |\n| --- | ---: | ---: | --- | --- |"
);
for (const [id, tools] of Object.entries(groups)) {
  console.log(
    `| ${KronTermToolFamilies[id].label} | ${tools.length} | ${tools.length} | Session grant required | Runtime prerequisite check required |`
  );
}
console.log(`\nTotal registered: ${manifest.length}. Classified: ${Object.values(groups).flat().length}.`);
console.log(
  "\nACP recommendations and tool_search use the same family metadata. The native bridge and Hermes adapter consume the live manifest. Session scopes can reduce advertisement; authority and runtime readiness are checked at execution, not established by this inventory."
);
