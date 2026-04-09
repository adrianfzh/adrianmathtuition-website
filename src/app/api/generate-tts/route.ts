import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multi-slide generation

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface Slide {
  narration?: string;
  [key: string]: unknown;
}

interface LessonData {
  slides: Slide[];
  audio_urls?: (string | null)[];
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, lessonData, provider, voice, password } = body as {
    slug: string;
    lessonData: LessonData;
    provider: 'openai-tts-1' | 'openai-tts-1-hd' | 'elevenlabs';
    voice?: string;
    password: string;
  };

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }
  if (!slug || !lessonData?.slides) {
    return NextResponse.json({ error: 'Missing slug or lessonData' }, { status: 400, headers: CORS });
  }

  const slides = lessonData.slides;
  const audioUrls: (string | null)[] = [];
  let generatedCount = 0;

  for (let i = 0; i < slides.length; i++) {
    const narration = slides[i].narration?.trim();
    if (!narration) {
      audioUrls.push(null);
      continue;
    }

    let audioBuffer: Buffer;

    try {
      if (provider === 'elevenlabs') {
        const voiceId = voice || 'EXAVITQu4vr4xnSDxMaL'; // Sarah (default ElevenLabs voice)
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: narration,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        if (!response.ok) {
          const err = await response.text();
          throw new Error(`ElevenLabs error: ${err}`);
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        // OpenAI TTS
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const model = provider === 'openai-tts-1-hd' ? 'tts-1-hd' : 'tts-1';
        const selectedVoice = (voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer') || 'nova';
        const response = await openai.audio.speech.create({
          model,
          voice: selectedVoice,
          input: narration,
          response_format: 'mp3',
        });
        audioBuffer = Buffer.from(await response.arrayBuffer());
      }
    } catch (err: unknown) {
      console.error(`[generate-tts] slide ${i} error:`, (err as Error).message);
      audioUrls.push(null);
      continue;
    }

    // Upload to Supabase Storage
    const path = `${slug}/slide_${i}.mp3`;
    const { error: uploadError } = await getSupabaseAdmin()
      .storage
      .from('lesson-audio')
      .upload(path, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[generate-tts] upload error slide ${i}:`, uploadError.message);
      audioUrls.push(null);
      continue;
    }

    // Get public URL
    const { data: urlData } = getSupabaseAdmin()
      .storage
      .from('lesson-audio')
      .getPublicUrl(path);

    audioUrls.push(urlData.publicUrl);
    generatedCount++;
  }

  // Update lesson_data in Supabase with audio_urls
  const updatedLessonData: LessonData = { ...lessonData, audio_urls: audioUrls };
  const { error: updateError } = await getSupabaseAdmin()
    .from('lesson_content')
    .update({ lesson_data: updatedLessonData })
    .eq('slug', slug);

  if (updateError) {
    console.error('[generate-tts] DB update error:', updateError.message);
    // Still return the URLs even if the DB update failed
  }

  // Rough cost estimate
  const totalChars = slides.reduce((sum, s) => sum + (s.narration?.length || 0), 0);
  const costPerK = provider === 'elevenlabs' ? 0.18 : provider === 'openai-tts-1-hd' ? 0.030 : 0.015;
  const cost = `$${((totalChars / 1000) * costPerK).toFixed(3)}`;

  return NextResponse.json({
    audioUrls,
    totalSlides: slides.length,
    generatedSlides: generatedCount,
    cost,
  }, { headers: CORS });
}
