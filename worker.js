export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/") {
      return json({ error: "Not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { message_id, user_id, username, text, chat_id, warnings } = body;

    if (!text) return json({ error: "text is required" }, 400);

    // Hard block before hitting AI
    const hardBlock = ["porn", "18+", "nude", "naked"];
    if (hardBlock.some(w => text.toLowerCase().includes(w))) {
      return json({
        action: "ban",
        reply: `🚫 @${username} has been banned for posting inappropriate content.`,
        reason: "explicit content",
        mute_duration: 0
      });
    }

    const model = "@cf/meta/llama-3.1-8b-instruct-fast";

    const messages = [
      {
        role: "system",
        content: `You are a strict but friendly AI moderator for a free earnings and crypto Telegram group.

Your job is to analyze each message and decide the best moderation action.

Possible actions:
- "none" → message is fine, do nothing
- "warn" → message is borderline, warn the user
- "delete" → delete the message silently
- "mute" → mute user (return mute_duration in minutes)
- "kick" → remove user from group
- "ban" → permanently ban user
- "reply" → message is fine but AI wants to respond

Group rules:
- No spam or repeated messages
- No scam links or investment fraud
- No referral links unless in designated topics
- No hate speech or insults
- No adult content
- Crypto and free earning discussion is welcome
- Be friendly when replying, firm when warning
- If warnings > 0, be stricter
- Use clear, firm, and professional English in all replies
- Be polite but direct when warning users
- Never use slang or informal language

Reply ONLY with valid JSON, no explanation, no markdown:
{"action":"warn","reply":"your message here","reason":"short reason","mute_duration":0}`
      },
      {
        role: "user",
        content: `Moderate this message:
User: @${username} (ID: ${user_id})
Previous warnings: ${warnings ?? 0}
Message: "${text}"`
      }
    ];

    try {
      const aiResponse = await env.AI.run(model, { messages });
      const raw = (typeof aiResponse.response === "string" ? aiResponse.response : JSON.stringify(aiResponse.response)).replace(/```json|```/g, "").trim();

      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        return json({
          action: "none",
          reply: "",
          reason: "AI returned invalid JSON",
          mute_duration: 0
        });
      }

      // Escalate if too many warnings
      if ((warnings ?? 0) >= 3 && result.action === "warn") {
        result.action = "mute";
        result.mute_duration = 60;
        result.reply = `⚠️ @${username} You have received too many warnings. You have been muted for 1 hour. Please review the group rules.`;
      }

      return json(result);

    } catch (err) {
      return json({ error: "AI failed", details: err.message }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
