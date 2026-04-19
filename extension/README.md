# PostFlow Notifier — Extensão Chrome

Notificações dos seus posts agendados no PostFlow:
- 10 minutos antes do horário
- Na hora exata da postagem
- Clique abre o dia correspondente no PostFlow

## Instalação

1. Descompacte este ZIP em uma pasta.
2. Abra `chrome://extensions` no Chrome (ou Edge / Brave / Arc / Opera).
3. Ative o **Modo desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta descompactada.
5. Clique no ícone da extensão e cole o **token** gerado em
   PostFlow → Settings → Integração com Extensão Chrome.

## Como funciona

- Polling automático a cada 1 minuto via `chrome.alarms` (compatível com MV3).
- De-duplicação por (post + tipo + dia) — você nunca recebe a mesma notificação duas vezes.
- Em caso de erro de rede, a extensão tenta novamente no próximo ciclo silenciosamente.
- Se o token for revogado, você recebe um aviso e pode reconectar.

## Permissões

- `storage`: armazena seu token e cache de posts localmente.
- `alarms`: agenda o polling periódico.
- `notifications`: envia as notificações desktop.
- Acesso ao host `https://vibe-queue-up.lovable.app/*`: para consultar seus posts.

## Suporte

A extensão consulta apenas o endpoint `/api/extension/posts-today` da sua conta.
Nenhum dado é enviado para terceiros.
