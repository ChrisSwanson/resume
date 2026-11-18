// Registers the agent tools (src/agent-tools.js) with WebMCP when the browser exposes it.
// Current Chrome shape: document.modelContext.registerTool(tool, { signal }), where tool has
// name, description, inputSchema, annotations and an async execute(input) that returns a string.
// Older drafts and polyfills used navigator.modelContext, so both are checked.

export function modelContext() {
  return (typeof document !== 'undefined' && document.modelContext) ||
    (typeof navigator !== 'undefined' && navigator.modelContext) || null;
}

/** @returns {Promise<{supported: boolean, registered: string[], errors: string[], unregister: () => void}>} */
export async function registerTools(tools) {
  const mc = modelContext();
  const controller = new AbortController();
  const result = { supported: !!mc, registered: [], errors: [], unregister: () => controller.abort() };
  if (!mc?.registerTool) return result;
  for (const t of tools) {
    try {
      const { execute, ...meta } = t;
      await mc.registerTool(
        {
          ...meta,
          execute: async (input) => {
            try { return await execute(input ?? {}); }
            catch (e) { return `Error: ${e?.message ?? e}`; }
          },
        },
        { signal: controller.signal },
      );
      result.registered.push(t.name);
    } catch (e) {
      result.errors.push(`${t.name}: ${e?.message ?? e}`);
    }
  }
  return result;
}
