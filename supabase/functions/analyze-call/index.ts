import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingId, transcription, callDetails } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const systemPrompt = `You are a sales call analyzer. Analyze the following call transcription and provide:
1. A concise summary (2-3 sentences) of the call content and outcome
2. 3-5 actionable next steps for the sales person

Context about the call:
- Contact: ${callDetails.contactName || 'Unknown'}
- Duration: ${callDetails.duration} seconds
- Type: ${callDetails.callType}

Respond using the analyze_call function.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Call transcription:\n${transcription || 'No transcription available. Please provide general follow-up suggestions based on the call type and duration.'}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_call",
              description: "Analyze a sales call and provide summary and next actions",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "A concise 2-3 sentence summary of the call"
                  },
                  next_actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", description: "The action to take" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        timeframe: { type: "string", description: "When to complete this action" }
                      },
                      required: ["action", "priority", "timeframe"]
                    },
                    description: "List of recommended next actions"
                  }
                },
                required: ["summary", "next_actions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_call" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    
    let analysis = {
      summary: "Call completed. Follow up with the contact.",
      next_actions: [
        { action: "Send follow-up message", priority: "high", timeframe: "Within 24 hours" },
        { action: "Update lead status", priority: "medium", timeframe: "Today" }
      ]
    };

    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Update the recording with AI analysis
    if (recordingId) {
      const { error: updateError } = await supabase
        .from("call_recordings")
        .update({
          ai_summary: analysis.summary,
          ai_next_actions: analysis.next_actions,
          transcription: transcription || null,
          processed_at: new Date().toISOString()
        })
        .eq("id", recordingId);

      if (updateError) {
        console.error("Failed to update recording:", updateError);
      }
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("analyze-call error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
