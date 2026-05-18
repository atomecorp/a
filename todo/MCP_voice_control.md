Device Automation – Voice Autonomous macOS Agent

Master Build Specification

You are a senior macOS systems engineer.

Your task is to build a complete, production-ready Voice Autonomous Agent for macOS.

The agent must:
 • Continuously listen to the microphone
 • Convert speech to text
 • Interpret the user’s intent
 • Execute safe shell commands or structured system tasks
 • Perform multi-step reasoning (example: fetch emails → summarize → draft reply → send)
 • Respond back using text-to-speech
 • Maintain conversational context
 • Log all actions
 • Be secure by design

Do NOT create a toy demo. Build a robust modular architecture.

⸻

1. System Architecture

1.1 Audio Input Layer
 • macOS microphone access
 • Voice activity detection
 • Speech-to-Text using Whisper (local model preferred)
 • Fallback to OpenAI API if configured

⸻

1.2 Intent & Planning Layer
 • Send transcript to GPT-4.1 or GPT-4o
 • Use function calling
 • The model must NOT directly generate shell text
 • It must return structured JSON tool calls

Example schema:

{
  "action": "read_email",
  "parameters": {
    "account": "icloud",
    "filter": "unread"
  }
}

Never allow free-form shell execution.

⸻

1.3 Tool Execution Layer

Implement a strict tool registry.

Allowed tools:
 • read_email
 • summarize_text
 • draft_email
 • send_email
 • list_sms
 • execute_whitelisted_shell
 • open_application
 • read_file
 • write_file
 • web_fetch
 • bank_login (stub only, no real credentials in code)

Shell execution rules:
 • Only allow commands from a whitelist
 • No pipes
 • No sudo
 • No chained commands
 • No dynamic string interpolation

Use child_process.spawn with argument array.

⸻

1.4 Voice Output Layer

Use:
 • macOS native say command OR
 • ElevenLabs API if key exists

The agent must:
 • Confirm actions before executing sensitive tasks
 • Speak summaries naturally
 • Handle follow-up dialogue

⸻

1.5 Context & Memory

Maintain:
 • Short term session memory
 • Conversation history
 • Tool results cache
 • Persistent logs in JSON

⸻

1.6 Security Requirements
 • Require wake word (example: “Computer”)
 • Confirmation required for:
 • sending emails
 • deleting files
 • bank access
 • shell execution
 • Store API keys in .env
 • No plaintext credentials
 • Rate limit tool execution

⸻

1. Project Structure

Generate a clean project structure:

voice-agent/
 ├── src/
 │   ├── audio/
 │   ├── llm/
 │   ├── tools/
 │   ├── executor/
 │   ├── memory/
 │   ├── tts/
 │   └── index.js
 ├── .env
 ├── package.json
 └── README.md

Requirements:
 • Node.js 20+
 • No TypeScript
 • No unnecessary dependencies
 • No UI
 • CLI only

⸻

1. Implementation Details

Use:
 • node-record-lpcm16 for microphone
 • whisper.cpp local binding OR OpenAI API
 • OpenAI function calling
 • child_process.spawn
 • node-fetch for web
 • Mail access via IMAP
 • SMS via AppleScript bridge
 • macOS automation via AppleScript when needed

Do not hallucinate libraries.
Only use stable existing npm packages.

⸻

1. Workflow Example

User says:

“Computer, check my unread emails and summarize them.”

Flow must be:
 1. Wake word detection
 2. Transcribe speech
 3. Send to GPT with tool schema
 4. GPT returns structured call: read_email
 5. Execute tool
 6. Return result to GPT
 7. GPT summarizes
 8. Speak result

⸻

1. Advanced Multi-Step Task

Example:

“Computer, reply to the third email and say I will respond tomorrow.”

System must:
 • Fetch email list
 • Identify index 3
 • Draft reply
 • Ask confirmation
 • Send email
 • Speak confirmation

⸻

1. Error Handling
 • Graceful fallback if Whisper fails
 • Retry OpenAI calls
 • Timeout protection
 • Clear spoken error messages
 • Log full error stack in log file

⸻

1. Output Requirement

The AI generating this system must:
 1. Generate all source files
 2. Generate package.json
 3. Provide .env template
 4. Provide setup instructions
 5. Provide security explanation
 6. Provide example test commands

Do not explain theory.
Produce full code.

⸻

END OF SPECIFICATION
