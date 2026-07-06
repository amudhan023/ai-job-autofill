from unittest.mock import MagicMock, patch

from app.services.llm import GeminiEmbeddings, GeminiLLM


def test_gemini_llm_complete() -> None:
    # Setup mock
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Hello from Gemini"
    mock_client.models.generate_content.return_value = mock_response

    # Patch at the point of use inside llm.py (lazy import via `from google import genai`)
    with patch("app.services.llm.GeminiLLM._ensure", return_value=mock_client):
        llm = GeminiLLM(api_key="test_key", model="gemini-2.0-flash")
        result = llm.complete(system="System instructions", user="Hello", model="unused-model")

        assert result == "Hello from Gemini"
        mock_client.models.generate_content.assert_called_once()
        _, kwargs = mock_client.models.generate_content.call_args
        assert kwargs["model"] == "gemini-2.0-flash"
        assert kwargs["contents"] == "Hello"
        assert kwargs["config"].system_instruction == "System instructions"


def test_gemini_embeddings_embed() -> None:
    # Setup mock
    mock_client = MagicMock()
    mock_embedding_1 = MagicMock()
    mock_embedding_1.values = [0.1, 0.2, 0.3]
    mock_embedding_2 = MagicMock()
    mock_embedding_2.values = [0.4, 0.5, 0.6]

    mock_response = MagicMock()
    mock_response.embeddings = [mock_embedding_1, mock_embedding_2]
    mock_client.models.embed_content.return_value = mock_response

    with patch("app.services.llm.GeminiEmbeddings._ensure", return_value=mock_client):
        embeddings = GeminiEmbeddings(api_key="test_key", model="models/gemini-embedding-001")
        result = embeddings.embed(["hello", "world"])

        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        mock_client.models.embed_content.assert_called_once_with(
            model="models/gemini-embedding-001",
            contents=["hello", "world"],
        )
