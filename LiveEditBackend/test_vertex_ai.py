from ai_client import describe_ai_backend, get_genai_client, get_text_model_name

print(f"Backend: {describe_ai_backend()}")
client = get_genai_client()
response = client.models.generate_content(
    model=get_text_model_name(),
    contents="Reply with exactly: VERTEX_OK",
)
print(getattr(response, "text", ""))
