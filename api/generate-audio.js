export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  if (!process.env.MUREKA_API_KEY) {
    return res.status(500).json({ error: 'A API Mureka ainda não está configurada.' });
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

    console.log('Mureka generation started:', { model: 'auto', bpm: safeBpm });

    const createResponse = await fetch('https://api.mureka.ai/v1/song/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MUREKA_API_KEY}`
      },
      body: JSON.stringify({
        lyrics,
        model: 'auto',
        prompt
      })
    });

    const createText = await createResponse.text();
    let createData;
    try {
      createData = JSON.parse(createText);
    } catch {
      createData = null;
    }

    if (!createResponse.ok) {
      console.error('Mureka create error:', createResponse.status, createText);
      if (createResponse.status === 401) {
        return res.status(401).json({ error: 'A chave da API Mureka é inválida.' });
      }
      if (createResponse.status === 402) {
        return res.status(402).json({ error: 'A conta Mureka precisa de créditos para gerar a música.' });
      }
      if (createResponse.status === 429) {
        return res.status(429).json({ error: 'O limite da API Mureka foi atingido. Tente novamente mais tarde.' });
      }
      return res.status(createResponse.status >= 500 ? 502 : createResponse.status).json({
        error: 'O serviço Mureka não conseguiu iniciar a geração da música.'
      });
    }

    const taskId = createData?.id || createData?.task_id;
    if (!taskId) {
      console.error('Mureka response without task id:', createText);
      return res.status(502).json({ error: 'A Mureka iniciou uma resposta inesperada sem identificador de tarefa.' });
    }

    // Mureka generation is asynchronous. Poll briefly so the existing
    // MusicAI button can continue to receive the final MP3 directly.
    const maxAttempts = 24;
    const delayMs = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const queryResponse = await fetch(`https://api.mureka.ai/v1/song/query/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.MUREKA_API_KEY}`
        }
      });

      const queryText = await queryResponse.text();
      let queryData;
      try {
        queryData = JSON.parse(queryText);
      } catch {
        queryData = null;
      }

      if (!queryResponse.ok) {
        console.error('Mureka query error:', queryResponse.status, queryText);
        return res.status(queryResponse.status >= 500 ? 502 : queryResponse.status).json({
          error: 'Não foi possível consultar o estado da geração Mureka.'
        });
      }

      const status = String(queryData?.status || '').toLowerCase();
      console.log('Mureka generation status:', status || 'unknown', `attempt=${attempt + 1}`);

      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        return res.status(502).json({ error: 'A Mureka não conseguiu concluir a geração da música.' });
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
        if (!audioUrl) {
          console.error('Mureka completed without audio URL:', queryText);
          return res.status(502).json({ error: 'A Mureka concluiu a geração, mas não devolveu o ficheiro de áudio.' });
        }

        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          console.error('Mureka audio download error:', audioResponse.status);
          return res.status(502).json({ error: 'A música foi gerada, mas não foi possível obter o ficheiro de áudio.' });
        }

        const audio = Buffer.from(await audioResponse.arrayBuffer());
        res.setHeader('Content-Type', audioResponse.headers.get('content-type') || 'audio/mpeg');
        res.setHeader('Content-Disposition', 'inline; filename="musicai-song.mp3"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(audio);
      }
    }

    return res.status(504).json({ error: 'A geração Mureka demorou mais do que o esperado. Tente novamente.' });
  } catch (error) {
    console.error('Mureka audio generation error:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar o áudio.' });
  }
}
