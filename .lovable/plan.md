
## O que vai acontecer às 18h30 (horário SP)

Você tem **1 post agendado** para hoje, 19/04, às **18h30 SP** (= 21:30 UTC):

> **"Simpatia da prosperidade financeira..."** — status `pending`

A extensão Chrome **NÃO publica nada** — ela só **avisa** você. O fluxo é:

### Linha do tempo esperada hoje
- **18h20 SP (10 min antes)** — extensão dispara notificação desktop:
  - Título: *"Post em 10 minutos"*
  - Mensagem: *"Simpatia da prosperidade financeira... às 18:30"*
- **18h30 SP (na hora)** — extensão dispara segunda notificação:
  - Título: *"É a hora de postar!"*
  - Mensagem: *"Simpatia da prosperidade financeira... — agendado para 18:30"*
  - Esta fica fixa na tela (`requireInteraction: true`) até você clicar
- **Clique na notificação** → abre `https://vibe-queue-up.lovable.app/w/6fae7690-.../day/2026-04-19` no navegador, onde você publica manualmente no Instagram/TikTok/YT.

### Como a extensão decide disparar
- Faz polling a cada **1 minuto** em `/api/extension/posts-today` com seu token.
- Janela de "aviso 10 min": dispara quando faltam **entre 9 e 10 minutos** para o `scheduled_at`.
- Janela "hora exata": dispara quando passou **entre 0 e 1 minuto** do `scheduled_at`.
- De-duplicação por `(post_id + tipo + dia)` — você não recebe a mesma notificação 2x.

### O que NÃO vai acontecer
- ❌ A extensão não posta no Instagram/TikTok/YT — não tem credenciais de redes sociais.
- ❌ O status do post não muda automaticamente para `posted` — você precisa marcar manualmente como postado no calendário.

### Coisas a observar para confirmar que funcionou
1. Notificação desktop aparece às 18h20 e 18h30 (verifique se o Chrome tem permissão de notificação no SO).
2. Se nada aparecer, abra o popup da extensão e veja:
   - Token está conectado?
   - "Última verificação" recente (< 2 min)?
   - Algum erro de auth?
3. Se quiser forçar agora pra testar, no popup há (ou deveria ter) um botão "Verificar agora" que dispara `RUN_NOW`.

### Nota sobre o horário
- O post está salvo como `21:30 UTC` no banco, que corresponde exatamente a **18h30 em São Paulo (UTC-3)** — correto.
- A extensão usa `new Date(scheduled_at)` que respeita o fuso do SO do seu computador, então o cálculo das janelas (10 min antes / na hora) usa o horário local correto.
