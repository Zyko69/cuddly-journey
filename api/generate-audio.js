async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
}

function getAceBaseUrl() {
  return String(process.env.ACE_STEP_API_URL || '').trim().replace(/\/+$/, '');
}

async function generateWithAceStep({ lyrics, prompt, bpm }) {
  const baseUrl = getAceBaseUrl();
  if (!baseUrl) return null;

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ACE_STEP_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ACE_STEP_API_KEY}`;
  }

  const duration = Math.max(10, Math.min(Number(process.env.ACE_STEP_DURATION) || 60, 300));

  console.log('ACE-Step generation started:', { bpm, duration });

  const createResponse = await fetch(`${baseUrl}/release_task`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      lyrics,
      task_type: 'text2music',
      audio_duration: duration,
      audio_format: 'mp3',
      bpm,
      thinking: false,
      use_format: false,
      vocal_language: 'en',
      inference_steps: 8
    })
  });

  const { data: createData, text: createText } = await parseJsonResponse(createResponse);

  if (!createResponse.ok) {
    throw new Error(`ACE-Step create failed (${createResponse.status}): ${createText.slice(0, 500)}`);
  }

  const taskId = createData?.data?.task_id || createData?.task_id;
  if (!taskId) {
    throw new Error('ACE-Step did not return a task_id.');
  }

  // ACE-Step is asynchronous. Poll until the task succeeds or fails.
  const maxAttempts = 36;
  const delayMs = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const queryResponse = await fetch(`${baseUrl}/query_result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task_id_list: [taskId] })
    });

    const { data: queryData, text: queryText } = await parseJsonResponse(queryResponse);

    if (!queryResponse.ok) {
      throw new Error(`ACE-Step query failed (${queryResponse.status}): ${queryText.slice(0, 500)}`);
    }

    const result = queryData?.data?.[0] || queryData?.results?.[0] || queryData?.[0];
    const status = Number(result?.status);

    console.log('ACE-Step generation status:', status, `attempt=${attempt + 1}`);

    if (status === 2) {
      throw new Error('ACE-Step reported a failed generation task.');
    }

    if (status === 1) {
      let parsedResult = result?.result;
      if (typeof parsedResult === 'string') {
        try {
          parsedResult = JSON.parse(parsedResult);
        } catch {
          parsedResult = null;
        }
      }

      const firstResult = Array.isArray(parsedResult) ? parsedResult[0] : parsedResult;
      const filePath = firstResult?.file;

      if (!filePath || typeof filePath !== 'string') {
        throw new Error('ACE-Step completed without an audio file path.');
      }

      const audioUrl = filePath.startsWith('http')
        ? filePath
        : `${baseUrl}${filePath.startsWith('/') ? '' : '/'}${filePath}`;

      const audioResponse = await fetch(audioUrl, {
        headers: process.env.ACE_STEP_API_KEY
          ? { Authorization: `Bearer ${process.env.ACE_STEP_API_KEY}` }
          : undefined
      });

      if (!audioResponse.ok) {
        throw new Error(`ACE-Step audio download failed (${audioResponse.status}).`);
      }

      const audio = Buffer.from(await audioResponse.arrayBuffer());
      return audio;
    }
  }

  throw new Error('ACE-Step generation timed out.');
}

async function generateWithMureka({ lyrics, prompt }) {
  if (!process.env.MUREKA_API_KEY) return null;

  console.log('Falling back to Mureka generation.');

  const createResponse = await fetch('https://api.mureka.ai/v1/song/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MUREKA_API_KEY}`
    },
    body: JSON.stringify({ lyrics, model: 'auto', prompt })
  });

  const { data: createData, text: createText } = await parseJsonResponse(createResponse);

  if (!createResponse.ok) {
    console.error('Mureka create error:', createResponse.status, createText);
    if (createResponse.status === 401) throw new Error('A chave da API Mureka é inválida.');
    if (createResponse.status === 402) throw new Error('A conta Mureka precisa de créditos para gerar a música.');
    if (createResponse.status === 429) throw new Error('O limite da API Mureka foi atingido.');
    throw new Error('O serviço Mureka não conseguiu iniciar a geração da música.');
  }

  const taskId = createData?.id || createData?.task_id;
  if (!taskId) throw new Error('A Mureka não devolveu um identificador de tarefa.');

  const maxAttempts = 24;
  const delayMs = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const queryResponse = await fetch(`https://api.mureka.ai/v1/song/query/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.MUREKA_API_KEY}` }
    });

    const { data: queryData, text: queryText } = await parseJsonResponse(queryResponse);

    if (!queryResponse.ok) {
      console.error('Mureka query error:', queryResponse.status, queryText);
      throw new Error('Não foi possível consultar o estado da geração Mureka.');
    }

    const status = String(queryData?.status || '').toLowerCase();
    console.log('Mureka generation status:', status || 'unknown', `attempt=${attempt + 1}`);

    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new Error('A Mureka não conseguiu concluir a geração da música.');
    }

    if (['completed', 'succeeded', 'success', 'done'].includes(status)) {
      const candidates = [
        queryData?.audio_url,
        queryData?.audio?.url,
        queryData?.song?.audio_url,
        queryData?.song?.url,
        queryData?.result?.audio_url,
        queryData?.result?.url
      ].filter((value) => typeof value === 'string' && value.startsWith('http'));

      const audioUrl = candidates[0];
      if (!audioUrl) throw new Error('A Mureka concluiu a geração, mas não devolveu o ficheiro de áudio.');

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error('A música foi gerada, mas não foi possível obter o ficheiro de áudio.');

      return Buffer.from(await audioResponse.arrayBuffer());
    }
  }

  throw new Error('A geração Mureka demorou mais do que o esperado.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { genre, language, mood, energy, bpm, key, sections } = req.body || {};

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'É necessário gerar primeiro a composição.' });
    }

    const lyrics = sections
      .slice(0, 30)
      .map((section, index) => `[${section?.name || `Section ${index + 1}`}]\n${String(section?.lyrics || '').trim()}`)
      .join('\n\n')
      .trim();

    if (!lyrics) {
      return res.status(400).json({ error: 'A composição não contém letra para gerar o áudio.' });
    }

    const safeBpm = Number(bpm) || 110;
    const prompt = [
      String(genre || 'Pop'),
      String(mood || 'Inspirador'),
      String(language || 'Português'),
      `${safeBpm} BPM`,
      `${String(key || 'Am')} key`,
      `${Number(energy) || 70}% energy`,
      'professional modern production'
    ].join(', ');

    // ACE-Step is the preferred generator when its RunPod API URL is configured.
    if (getAceBaseUrl()) {
      try {
        const audio = await generateWithAceStep({ lyrics, prompt, bpm: safeBpm });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', 'inline; filename="musicai-song.mp3"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(audio);
      } catch (aceError) {
        console.error('ACE-Step generation error:', aceError);
        // Fall through to Mureka so the existing MusicAI workflow is preserved.
      }
    }

    if (!process.env.MUREKA_API_KEY) {
      return res.status(503).json({
        error: 'A geração de áudio ainda não está configurada. Configure ACE_STEP_API_URL ou MUREKA_API_KEY.'
      });
    }

    const audio = await generateWithMureka({ lyrics, prompt });
    if (!audio) {
      return res.status(503).json({ error: 'Nenhum gerador de áudio está configurado.' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="musicai-song.mp3"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (error) {
    console.error('MusicAI audio generation error:', error);
    return res.status(500).json({ error: error?.message || 'Erro interno ao gerar o áudio.' });
  }
}
