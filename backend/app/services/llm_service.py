import abc
import asyncio
from typing import Optional
import httpx
from app.config import settings


class BaseLLMClient(abc.ABC):
    @abc.abstractmethod
    async def generate_response(
        self, prompt: str, system_instruction: Optional[str] = None
    ) -> str:
        pass


class GeminiClient(BaseLLMClient):
    """Direct HTTP REST client for Google Gemini.
    
    Uses header-based API key authentication, prioritizes active model aliases
    (gemini-flash-latest, gemini-3.8-flash, gemini-pro-latest), and suppresses
    internal reasoning traces.
    """

    def __init__(self):
        raw_key = str(settings.GEMINI_API_KEY or "")
        self.api_key = raw_key.strip("\"' \r\n\t")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured in .env")

        raw_model = str(settings.GEMINI_MODEL or "gemini-flash-latest")
        primary = raw_model.strip("\"' \r\n\t").replace("models/", "")

        # Models verified to exist and accept generateContent on your API key
        pool = [
            primary,
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-flash-latest",
            "gemini-3.8-flash",
            "gemini-pro-latest",
        ]
        self.models_to_try = []
        for m in pool:
            if m not in self.models_to_try:
                self.models_to_try.append(m)

    def _clean_output(self, raw_text: str) -> str:
        """Removes reasoning scratchpads and extraction markers."""
        text = raw_text.strip()
        markers = [
            "**Selected Response:**",
            "**Response:**",
            "Selected Response:",
            "Final Response:",
            "**Final Response:**",
        ]
        for marker in markers:
            if marker in text:
                text = text.split(marker)[-1].strip()
        return text

    async def _call_model(
        self, client: httpx.AsyncClient, model_name: str, payload: dict, headers: dict
    ) -> Optional[str]:
        # Google Generative Language v1beta generateContent endpoint
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"

        try:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    final_text_parts = [
                        p.get("text", "")
                        for p in parts
                        if not p.get("thought", False) and "text" in p
                    ]
                    raw_text = "".join(final_text_parts).strip()
                    if raw_text:
                        return self._clean_output(raw_text)
                return ""

            if response.status_code == 429:
                print(f"Model '{model_name}' rate-limited (429). Trying fallback model...")
                return None

            if response.status_code == 404:
                print(f"Model '{model_name}' unavailable (404). Trying fallback model...")
                return None

            if response.status_code == 503:
                print(f"Model '{model_name}' overloaded (503). Retrying once in 2s...")
                await asyncio.sleep(2.0)
                retry_res = await client.post(url, headers=headers, json=payload)
                if retry_res.status_code == 200:
                    data = retry_res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        return "".join(
                            [p.get("text", "") for p in parts if not p.get("thought", False)]
                        ).strip()

            print(f"Gemini API ({model_name}) error {response.status_code}: {response.text[:180]}")
            return None

        except Exception as e:
            print(f"Network error contacting {model_name}: {e}")
            return None

    async def generate_response(
        self, prompt: str, system_instruction: Optional[str] = None
    ) -> str:
        # Adaptive system instruction: matches the user's intent and tone
        clean_instruction = (
            "You are DataPilot, an elite autonomous data analyst equipped with DuckDB OLAP.\n"
            "Guidelines:\n"
            "- Answer directly, systematically, and clearly based on the dataset.\n"
            "- SUPPORTED CHART TYPES: When visual analysis is requested, embed a ```chart block.\n"
            "  Supported 'type' values:\n"
            "  * 'bar' (categorical ranking/volume)\n"
            "  * 'horizontalBar' (long category labels/leaderboards)\n"
            "  * 'line' (trends over continuous values/time)\n"
            "  * 'area' (cumulative volume/trends)\n"
            "  * 'pie' (parts-of-a-whole / proportions)\n"
            "  * 'scatter' (two continuous metrics correlation)\n"
            "  * 'radar' (multi-feature metrics profile comparison)\n"
            "  * 'radialBar' (gauge percentages / score scales)\n"
            "  * 'composed' (bar + line dual comparison)\n"
            "- Never output internal chain-of-thought traces, scratchpads, or conversational apologies."
        )
        if system_instruction:
            clean_instruction = f"{clean_instruction}\n{system_instruction}"

        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "system_instruction": {"parts": [{"text": clean_instruction}]},
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
        }

        # Header-based authentication avoids URL query-string rate limit spikes
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        client_timeout = httpx.Timeout(connect=15.0, read=45.0, write=15.0, pool=15.0)

        async with httpx.AsyncClient(timeout=client_timeout) as client:
            for model in self.models_to_try:
                result = await self._call_model(client, model, payload, headers)
                if result:
                    return result

            raise RuntimeError(
                "All candidate Gemini models are currently busy or rate-limited. Please try again shortly."
            )


class OpenAIClient(BaseLLMClient):
    def __init__(self):
        from openai import AsyncOpenAI
        raw_key = str(settings.OPENAI_API_KEY or "").strip("\"' \r\n\t")
        if not raw_key:
            raise ValueError("OPENAI_API_KEY is not configured in .env")
        self.client = AsyncOpenAI(api_key=raw_key)
        self.model_name = settings.OPENAI_MODEL

    async def generate_response(
        self, prompt: str, system_instruction: Optional[str] = None
    ) -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=0.2,
        )
        return response.choices[0].message.content or ""


class GroqClient(BaseLLMClient):
    def __init__(self):
        from openai import AsyncOpenAI
        raw_key = str(settings.GROQ_API_KEY or "").strip("\"' \r\n\t")
        if not raw_key:
            raise ValueError("GROQ_API_KEY is not configured in .env")
        self.client = AsyncOpenAI(base_url="https://api.groq.com/openai/v1", api_key=raw_key)
        self.model_name = settings.GROQ_MODEL

    async def generate_response(
        self, prompt: str, system_instruction: Optional[str] = None
    ) -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=0.1,
        )
        return response.choices[0].message.content or ""


class OllamaClient(BaseLLMClient):
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model_name = settings.OLLAMA_MODEL

    async def generate_response(
        self, prompt: str, system_instruction: Optional[str] = None
    ) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "system": system_instruction or "",
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                raise RuntimeError(f"Ollama error: {res.text}")
            return res.json().get("response", "")


def get_llm_client(provider: Optional[str] = None) -> BaseLLMClient:
    selected = (provider or settings.DEFAULT_LLM_PROVIDER).lower()
    if selected == "gemini":
        return GeminiClient()
    elif selected == "openai":
        return OpenAIClient()
    elif selected == "groq":
        return GroqClient()
    elif selected == "ollama":
        return OllamaClient()
    else:
        raise ValueError(f"Unsupported LLM provider '{selected}'.")