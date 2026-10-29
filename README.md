# Minhas Finanças

App web de finanças pessoais, em português, feito só com HTML, CSS e JavaScript — sem servidor e sem dependências.

## O que faz

- Lança **gastos** e **entradas** com data, descrição, categoria e valor
- Mostra entradas, gastos e **saldo do mês**, com navegação entre meses
- **Total por categoria** do mês, com barras
- **Gráfico de rosca** dos gastos por categoria
- Salva tudo no navegador (`localStorage`); exportar/importar backup em JSON
- Opcional: **lançar pelo WhatsApp** e sincronizar entre aparelhos — veja [docs/WHATSAPP.md](docs/WHATSAPP.md)
- Layout pensado para celular, com tema escuro automático; pode ser adicionado à tela inicial

## Usar localmente

Abra o `index.html` no navegador. Pronto.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica o site a cada push na branch `main`.

1. No GitHub, vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça merge desta branch na `main` (ou rode o workflow manualmente em **Actions**).

O endereço será `https://<seu-usuario>.github.io/<nome-do-repositorio>/`.

> Sem a conexão opcional com a nuvem, os dados ficam só no navegador e aparelho em que foram lançados. Use **Exportar backup** para guardar uma cópia ou levar para outro aparelho.

## Estrutura

- `index.html`, `style.css`, `app.js` — o app (publicado no GitHub Pages)
- `api/worker.js`, `api/schema.sql` — API e bot do WhatsApp (Cloudflare Worker + banco D1), opcionais
