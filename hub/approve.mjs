// Old name for mcp.mjs. A hub agent still running older code starts this path for its turns; keep it so an update
// never leaves those turns without their tool server (which makes Claude refuse every tool call).
import './mcp.mjs';
