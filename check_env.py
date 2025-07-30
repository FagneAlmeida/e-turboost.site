import sys
import site

print("--- Diagnóstico do Ambiente Python ---")
print(f"Executável Python em uso: {sys.executable}")
print("\nCaminhos onde o Python está a procurar por pacotes (sys.path):")
for path in sys.path:
    print(f"- {path}")
print("\n--- Fim do Diagnóstico ---")