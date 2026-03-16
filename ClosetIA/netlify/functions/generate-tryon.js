const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { personImage, personMimeType, clothingImage, clothingMimeType } = body;

  if (!personImage || !clothingImage) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Imagens obrigatórias.' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada.' }) };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `Dress the person in the first image with the clothing item from the second image.
Keep the person's face, body, skin tone, and pose completely unchanged.
Adapt the clothing naturally to fit the body shape and posture.
Generate a single photorealistic full-body image of the person wearing the garment.`;

    const parts = [
      { text: prompt },
      { inlineData: { mimeType: personMimeType || 'image/jpeg', data: personImage } },
      { inlineData: { mimeType: clothingMimeType || 'image/jpeg', data: clothingImage } },
    ];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    });

    const candidates = result.response.candidates;
    if (!candidates?.length) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Gemini não retornou resposta.' }) };
    }

    let imageBase64 = null;
    let mimeType = 'image/png';

    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Gemini não gerou imagem. Tente com fotos diferentes.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType }),
    };

  } catch (err) {
    console.error('Erro Gemini:', err);
    let msg = 'Erro ao chamar o Gemini.';
    if (err.message?.includes('API key')) msg = 'API Key inválida.';
    else if (err.message?.includes('SAFETY')) msg = 'Imagem bloqueada por segurança. Use outras fotos.';
    else if (err.message?.includes('quota')) msg = 'Limite de quota atingido. Aguarde e tente novamente.';
    else msg = err.message;
    return { statusCode: 500, body: JSON.stringify({ error: msg }) };
  }
};
