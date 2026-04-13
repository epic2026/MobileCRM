import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const trimErrorMessage = (message: string) => message.slice(0, 500);

const looksLikePlaceholderTranscription = (value: string | null | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('imported from device recorder') || normalized.startsWith('manual debug recording');
};

const normalizeSummaryTo50Words = (summary: string) => {
  const source = (summary || '').trim();
  if (!source) return '';

  const words = source.replace(/\s+/g, ' ').split(' ').filter(Boolean);

  if (words.length >= 50) {
    return words.slice(0, 50).join(' ');
  }

  const fillerWords = [...words];
  if (fillerWords.length === 0) return '';

  let idx = 0;
  while (words.length < 50) {
    words.push(fillerWords[idx % fillerWords.length]);
    idx += 1;
  }

  return words.join(' ');
};

const normalizeNextActions = (actions: unknown): string[] => {
  if (!Array.isArray(actions)) return [];

  return actions
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && 'action' in item) {
        const value = String((item as { action?: unknown }).action ?? '').trim();
        return value;
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, 6);
};

const extractAnalysisPayload = (aiResponse: any) => {
  const message = aiResponse?.choices?.[0]?.message;
  const toolArgs = message?.tool_calls?.[0]?.function?.arguments;

  if (toolArgs) {
    try {
      return JSON.parse(toolArgs);
    } catch (error) {
      console.error('Failed to parse tool call arguments:', error);
    }
  }

  const content = message?.content;
  if (typeof content === 'string') {
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  return null;
};

const markAnalysisFailed = async (
  supabase: ReturnType<typeof createClient> | null,
  recordingId: string | null,
  reason: string,
) => {
  if (!supabase || !recordingId) return;

  const { error } = await supabase
    .from('call_recordings')
    .update({
      ai_summary: `AI analysis failed: ${trimErrorMessage(reason)}`,
      ai_next_actions: [],
      processed_at: new Date().toISOString(),
    })
    .eq('id', recordingId);

  if (error) {
    console.error('Failed to persist AI error state:', error);
  }
};

const persistFallbackAnalysis = async (
  supabase: ReturnType<typeof createClient> | null,
  recordingId: string | null,
  callDetails: { contactName?: string; duration?: number; callType?: string } | null,
  transcription: string | null,
  reason: string,
) => {
  if (!supabase || !recordingId) return;

  const duration = Number(callDetails?.duration || 0);
  const contact = callDetails?.contactName || 'the contact';
  const summary = normalizeSummaryTo50Words(
    `Call recording captured for ${contact}. Duration was ${duration} seconds. AI full analysis is temporarily unavailable, so this is a fallback summary based on available metadata and transcript fragments. Review recording playback, verify intent, log outcomes, and create follow-up tasks to maintain sales momentum while service recovers smoothly.`
  );

  const actions = [
    'Replay the recording and confirm customer intent plus decision timeline',
    'Update lead notes with key objections and promised follow-up points',
    'Schedule a follow-up call and assign owner with due date',
  ];

  const { error } = await supabase
    .from('call_recordings')
    .update({
      ai_summary: `${summary} [Fallback mode: ${trimErrorMessage(reason)}]`,
      ai_next_actions: actions,
      transcription: transcription,
      processed_at: new Date().toISOString(),
    })
    .eq('id', recordingId);

  if (error) {
    console.error('Failed to persist fallback AI state:', error);
  }
};

const mimeTypeForPath = (path: string) => {
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.m4a')) return 'audio/mp4';
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.aac')) return 'audio/aac';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.mp4')) return 'audio/mp4';
  return 'audio/mp4';
};

const INDIAN_LANGUAGE_HINT =
  'Audio may contain Indian languages and mixed code-switching. Likely languages include Hindi, Hinglish, Bengali, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia, Assamese, Urdu, and Bhojpuri. Transcribe spoken words faithfully in the original language/script with punctuation.';

type TranscriptionResult = {
  text: string | null;
  language: string | null;
  modelUsed: string | null;
};

const transcribeWithModel = async (params: {
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  apiKey: string;
  model: string;
}): Promise<TranscriptionResult> => {
  const { fileBlob, fileName, mimeType, apiKey, model } = params;

  const audioFile = new File([fileBlob], fileName, { type: mimeType });
  const formData = new FormData();
  formData.append('model', model);
  formData.append('file', audioFile);
  formData.append('prompt', INDIAN_LANGUAGE_HINT);
  if (model === 'whisper-1') {
    formData.append('response_format', 'verbose_json');
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI transcription error (${model}):`, response.status, errorText);
    return { text: null, language: null, modelUsed: null };
  }

  const transcriptionResult = await response.json();
  return {
    text: transcriptionResult.text?.trim() || null,
    language: transcriptionResult.language || null,
    modelUsed: model,
  };
};

const transcribeRecording = async (params: {
  recordingPath: string;
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
}) => {
  const { recordingPath, supabase, apiKey } = params;

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('call-recordings')
    .download(recordingPath);

  if (downloadError || !fileBlob) {
    console.error('Failed to download recording for transcription:', downloadError);
    return { text: null, language: null, modelUsed: null };
  }

  const fileName = recordingPath.split('/').pop() || 'recording.m4a';
  const mimeType = mimeTypeForPath(recordingPath);
  const modelsToTry = ['whisper-1', 'gpt-4o-mini-transcribe'];

  for (const model of modelsToTry) {
    const result = await transcribeWithModel({
      fileBlob,
      fileName,
      mimeType,
      apiKey,
      model,
    });

    if (result.text && result.text.length >= 8) {
      return result;
    }
  }

  return { text: null, language: null, modelUsed: null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let requestRecordingId: string | null = null;
  let requestSupabase: ReturnType<typeof createClient> | null = null;

  try {
    const { recordingId, transcription, callDetails } = await req.json();
    requestRecordingId = recordingId ?? null;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    requestSupabase = supabase;

    let finalTranscription = transcription?.trim() || null;
    let transcriptionLanguage: string | null = null;
    let transcriptionModelUsed: string | null = null;
    if (looksLikePlaceholderTranscription(finalTranscription)) {
      finalTranscription = null;
    }

    if (!finalTranscription && recordingId) {
      const { data: recordingRow, error: recordingError } = await supabase
        .from('call_recordings')
        .select('file_path, transcription')
        .eq('id', recordingId)
        .maybeSingle();

      if (recordingError) {
        console.error('Failed to load recording row:', recordingError);
      }

      finalTranscription = recordingRow?.transcription?.trim() || null;
      if (looksLikePlaceholderTranscription(finalTranscription)) {
        finalTranscription = null;
      }

      if (!finalTranscription && recordingRow?.file_path && OPENAI_API_KEY) {
        const transcriptionResult = await transcribeRecording({
          recordingPath: recordingRow.file_path,
          supabase,
          apiKey: OPENAI_API_KEY,
        });
        finalTranscription = transcriptionResult.text;
        transcriptionLanguage = transcriptionResult.language;
        transcriptionModelUsed = transcriptionResult.modelUsed;
      }
    }

    if (!OPENAI_API_KEY) {
      await persistFallbackAnalysis(
        supabase,
        recordingId,
        callDetails,
        finalTranscription,
        'OPENAI_API_KEY is not configured',
      );

      return new Response(
        JSON.stringify({
          summary: 'Fallback summary generated because AI service key is unavailable.',
          next_actions: [
            'Review call recording manually',
            'Update lead notes and next follow-up',
            'Retry AI analysis later',
          ],
          fallback: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!finalTranscription || finalTranscription.trim().length < 12) {
      await persistFallbackAnalysis(
        supabase,
        recordingId,
        callDetails,
        finalTranscription,
        'Unable to produce usable transcript from this recording',
      );

      return new Response(
        JSON.stringify({
          summary: 'Fallback summary generated because transcript quality was low.',
          next_actions: [
            'Replay audio and note key details manually',
            'Contact lead for clarification on unclear parts',
            'Retry AI analysis after a better quality recording',
          ],
          fallback: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are a sales call analyzer for field sales users.

  Analyze the call content and return:
  1. A call-specific summary of exactly 50 words.
  2. 3-6 crisp next action items as short bullet-ready imperative lines.

  Output constraints:
  - Do not include priority labels such as high, medium, or low.
  - Do not add numbering or bullet symbols in text.
  - Keep actions practical and context-driven.
  - Avoid generic advice unless transcript context is unavailable.

Context about the call:
- Contact: ${callDetails.contactName || 'Unknown'}
- Duration: ${callDetails.duration} seconds
- Type: ${callDetails.callType}
- Transcription language: ${transcriptionLanguage || 'unknown'}
- Transcription model: ${transcriptionModelUsed || 'unknown'}

Respond using the analyze_call function.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Call transcription:\n${finalTranscription}` }
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
                    description: "Exactly 50 words summarizing this call"
                  },
                  next_actions: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "A crisp next action line"
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
        await markAnalysisFailed(requestSupabase, requestRecordingId, 'OpenAI rate limit exceeded (429)');
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await markAnalysisFailed(requestSupabase, requestRecordingId, 'OpenAI billing/payment required (402)');
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      throw new Error(`OpenAI error ${response.status}: ${trimErrorMessage(errorText)}`);
    }

    const aiResponse = await response.json();
    const parsedPayload = extractAnalysisPayload(aiResponse);
    if (!parsedPayload) {
      throw new Error('AI returned unstructured output. Please retry analysis.');
    }

    const analysis = {
      summary: normalizeSummaryTo50Words(String(parsedPayload?.summary || '')),
      next_actions: normalizeNextActions(parsedPayload?.next_actions),
    };

    if (!analysis.summary) {
      throw new Error('AI returned empty summary. Please retry analysis.');
    }

    if (analysis.next_actions.length === 0) {
      throw new Error('AI returned empty next actions. Please retry analysis.');
    }

    // Update the recording with AI analysis
    if (recordingId) {
      const { error: updateError } = await supabase
        .from("call_recordings")
        .update({
          ai_summary: analysis.summary,
          ai_next_actions: analysis.next_actions,
          transcription: finalTranscription,
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
    const message = error instanceof Error ? error.message : "Unknown error";
    await markAnalysisFailed(requestSupabase, requestRecordingId, message);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
