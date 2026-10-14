async function askGemini(promptText) {
    const apiKey = AppConfig.getGeminiKey();
    if (!apiKey) {
        alert("Por favor, configure a chave API do Gemini no separador Gemini AI.");
        return null;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            return data.candidates[0].content.parts[0].text;
        }
        return "Sem resposta da AI.";
    } catch (err) {
        console.error("Erro na consulta Gemini:", err);
        return "Erro ao comunicar com o Gemini AI.";
    }
}