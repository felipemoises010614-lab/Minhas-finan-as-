# Lançar gastos pelo WhatsApp — passo a passo

Depois de configurado, você manda mensagens como `mercado 45,90` para um número de WhatsApp e o lançamento aparece no app.

```
Você no WhatsApp ──► Meta (WhatsApp Cloud API) ──► seu Worker na Cloudflare ──► banco D1
                                                          ▲
                              App no GitHub Pages ────────┘
```

Você vai precisar de **um computador** (é mais fácil copiar e colar por ele), do seu **celular com WhatsApp** e de uns **40 minutos**.
Tudo é gratuito para uso pessoal. A Meta muda as regras de preço com frequência: confira em
<https://developers.facebook.com/docs/whatsapp/pricing>. As mensagens que você manda e as respostas do bot logo em seguida são, pelas regras atuais, conversas de atendimento, que não são cobradas.

> Guarde as senhas e tokens deste guia num lugar seguro (um gerenciador de senhas, por exemplo) e não mande para ninguém.

---

## Parte 1 — Cloudflare: banco de dados e API

### 1. Crie a conta
Acesse <https://dash.cloudflare.com/sign-up> e crie uma conta gratuita.

### 2. Crie o banco de dados
1. No menu da esquerda, abra **Storage & databases → D1 SQL database** e clique em **Create database**.
2. Nome: `minhas-financas`. Clique em **Create**.
3. No banco criado, abra a aba **Console**.
4. Copie todo o conteúdo do arquivo [`api/schema.sql`](../api/schema.sql), cole no console e clique em **Execute**.

### 3. Crie o Worker (a API)
1. No menu, abra **Compute (Workers) → Workers & Pages** e clique em **Create**.
2. Escolha **Start with Hello World!**, dê o nome `minhas-financas` e clique em **Deploy**.
3. Clique em **Edit code**. Apague todo o código que aparece, copie todo o conteúdo de [`api/worker.js`](../api/worker.js), cole e clique em **Deploy**.
4. Anote o endereço do Worker, algo como `https://minhas-financas.SEU-USUARIO.workers.dev`.
   Abrindo esse endereço no navegador deve aparecer **"Minhas Finanças API está no ar ✅"**.

> **Sem copiar código (bom para o celular):** em vez dos itens 3 a 4 acima, ligue o Worker ao GitHub.
> No Worker, abra **Settings → Build → Connect**, escolha **GitHub**, o repositório `Minhas-finan-as-` e a branch `main`.
> Em **Root directory** (ou *Path*) coloque `api` e em **Deploy command** deixe `npx wrangler deploy`. Salve.
> A Cloudflare publica o código de `api/worker.js` sozinha, com o banco já ligado (arquivo `api/wrangler.toml`), e republica a cada mudança na `main`.
> Nesse caso, pule o passo 4.

### 4. Ligue o banco ao Worker
1. No Worker, abra **Settings → Bindings → Add binding → D1 database**.
2. **Variable name**: `DB` (exatamente assim, maiúsculo). **D1 database**: `minhas-financas`.
3. Salve (**Add binding** / **Deploy**).

### 5. Crie as duas primeiras senhas
No Worker, abra **Settings → Variables and Secrets → Add**. Para cada item abaixo, escolha o tipo **Secret**:

| Nome | Valor |
|---|---|
| `API_TOKEN` | Uma senha longa inventada por você (30+ caracteres, de um gerador de senhas). É a senha do app. |
| `VERIFY_TOKEN` | Outra palavra inventada, ex.: `financas-verifica-8231`. Só serve no passo 10. |

Clique em **Deploy** para salvar.

### 6. Conecte o app
1. Abra o app (o link do GitHub Pages) e role até **Seus dados**.
2. Toque em **Conectar à nuvem e ao WhatsApp**.
3. Cole o endereço do Worker (passo 3) e o `API_TOKEN` (passo 5) e toque em **Conectar**.
4. Se você já tinha lançamentos no app, ele pergunta se quer enviá-los para a nuvem. Responda **OK**.

Faça isso em cada aparelho em que for usar o app. A partir daqui os dados ficam na nuvem e aparecem em todos eles.

---

## Parte 2 — Meta: o número de WhatsApp

### 7. Crie a conta de desenvolvedor
Acesse <https://developers.facebook.com>, entre com sua conta do Facebook e clique em **Começar / Get Started** para se registrar como desenvolvedor (pede para confirmar seu telefone).

### 8. Crie o app
1. Clique em **Meus apps → Criar app**.
2. Dê um nome (ex.: `Minhas Finanças`).
3. No caso de uso, escolha **Conectar-se com clientes pelo WhatsApp** (*Connect with customers through WhatsApp*).
4. Quando pedir um **portfólio empresarial** (*business portfolio*), crie um com seu nome. Não precisa ter empresa.
5. Conclua a criação.

### 9. Pegue o número de teste e cadastre o seu
1. No painel do app, abra **WhatsApp → Configuração da API** (*API Setup*).
2. A Meta já fornece um **número de teste** no campo **De** (*From*). É para ele que você vai mandar as mensagens.
3. Copie a **Identificação do número de telefone** (*Phone number ID*), um número comprido. Guarde.
4. No campo **Para** (*To*), clique em **Gerenciar lista de números** e adicione **o seu** celular. Confirme com o código que chega no seu WhatsApp.
5. Clique em **Enviar mensagem** (*Send message*). Você deve receber uma mensagem "Hello World" do número de teste. **Salve esse contato** no celular, por exemplo como "Finanças".

### 10. Configure o webhook
1. Abra **WhatsApp → Configuração** (*Configuration*). Na seção **Webhook**, clique em **Editar**.
2. **URL de callback**: o endereço do Worker com `/webhook` no final, ex.: `https://minhas-financas.SEU-USUARIO.workers.dev/webhook`.
3. **Token de verificação**: o mesmo `VERIFY_TOKEN` do passo 5.
4. Clique em **Verificar e salvar**.
5. Ainda nessa página, em **Campos do webhook** (*Webhook fields*), clique em **Gerenciar** e ative (**Assinar** / *Subscribe*) o campo **`messages`**.

### 11. Pegue a chave secreta do app
Abra **Configurações do app → Básico** (*App settings → Basic*). Em **Chave secreta do app** (*App secret*), clique em **Mostrar** e copie.

### 12. Gere um token permanente
O token que aparece na tela do passo 9 expira em 24 horas. Para o bot funcionar sempre, gere um permanente:

1. Acesse <https://business.facebook.com/settings> e escolha o portfólio criado no passo 8.
2. Abra **Usuários → Usuários do sistema** (*System users*) e clique em **Adicionar**. Nome: `bot`. Função: **Administrador**.
3. Com o usuário `bot` selecionado, clique em **Atribuir ativos** (*Assign assets*):
   - **Apps** → seu app → **Controle total**;
   - **Contas do WhatsApp** → sua conta → **Controle total**.
4. Clique em **Gerar token** (*Generate token*), escolha seu app, validade **Nunca** (*Never*) e marque as permissões
   **`whatsapp_business_messaging`** e **`whatsapp_business_management`**.
5. Copie o token. Ele só aparece uma vez.

> Se quiser testar antes de fazer o passo 12, use o token temporário da tela do passo 9. Só lembre que ele para de funcionar em 24 horas.

### 13. Cadastre o restante no Worker
Volte ao Worker na Cloudflare → **Settings → Variables and Secrets → Add**, tipo **Secret**:

| Nome | Valor |
|---|---|
| `WHATSAPP_TOKEN` | O token do passo 12. |
| `PHONE_NUMBER_ID` | A identificação do número do passo 9. |
| `APP_SECRET` | A chave secreta do passo 11. |
| `ALLOWED_NUMBERS` | Seu celular só com dígitos: `55` + DDD + número, ex.: `5511987654321`. Para liberar mais pessoas, separe por vírgula. |

Clique em **Deploy**.

---

## Parte 3 — Teste

Mande **`oi`** para o número de teste. O bot responde com os exemplos. Depois tente:

| Você manda | O que acontece |
|---|---|
| `mercado 45,90` | Gasto de R$ 45,90 em Alimentação, hoje |
| `uber 23 ontem` | Gasto em Transporte com a data de ontem |
| `farmácia 80 15/10` | Gasto em Saúde no dia 15/10 |
| `+5000 salário` ou `recebi 5000 salário` | Entrada em Salário |
| `presente mãe 120 #compras` | Escolhe a categoria com `#` |
| várias linhas numa mensagem | Um lançamento por linha |
| `saldo` | Entradas, gastos e saldo do mês |
| `resumo` | Total por categoria do mês |
| `desfazer` | Apaga o último lançamento |

A categoria é escolhida pelas palavras da mensagem (mercado, ifood, uber, gasolina, aluguel, luz, farmácia…). Quando não reconhece, vai para **Outros**. Abra o app: o lançamento aparece lá também (ele atualiza sozinho quando você volta para ele, ou toque em **Atualizar agora**).

---

## Se algo não funcionar

Para ver o que o Worker está recebendo: na Cloudflare, abra o Worker → **Logs** (ou **Observability**) e ative os logs em tempo real; depois mande uma mensagem.

| Sintoma | Causa provável |
|---|---|
| "Verificar e salvar" do webhook dá erro | `VERIFY_TOKEN` diferente do digitado na Meta, ou o código do Worker não foi publicado (passo 3). |
| Log mostra `Assinatura inválida` | `APP_SECRET` errado (passo 11). |
| Log mostra `número não autorizado` | `ALLOWED_NUMBERS` não bate com seu número. Confira `55` + DDD + número, só dígitos. |
| Log mostra `Falha ao enviar` com `131030` | Seu número não está na lista **Para** do passo 9. |
| Log mostra `Falha ao enviar` com `190` | Token expirado ou errado. Gere o permanente (passo 12). |
| Nada aparece no log | Confira se o campo `messages` está assinado (passo 10). Se ainda assim nada chegar, coloque o app da Meta no modo **Publicado** (*Live*) no topo do painel; a Meta pede um link de política de privacidade e você pode usar o link do seu app. |
| App diz "Token inválido" | O token digitado no app é diferente do `API_TOKEN` (passo 5). |

## Bom saber

- O número de teste é da Meta e aparece com um nome genérico. Ele só conversa com até 5 números cadastrados no passo 9, o que basta para uso pessoal. Para ter um número próprio, você precisa de um chip que **não** esteja em uso no WhatsApp e de configurar o perfil comercial na Meta.
- O `API_TOKEN` fica salvo no navegador dos aparelhos conectados. Se perder um aparelho, troque o `API_TOKEN` no Worker e conecte de novo nos outros.
- Se a Meta descontinuar a versão da API usada pelo bot, crie a variável `GRAPH_VERSION` no Worker com a versão nova (ex.: `v25.0`).
- O fuso horário padrão é o de Brasília. Para mudar, crie a variável `TIMEZONE` (ex.: `America/Manaus`).
