# Amanda — álbum do caos

Mural de aniversário responsivo em React + TypeScript + Tailwind CSS. API Fastify, MariaDB e MinIO. Amigos com o link podem enviar uma foto por vez, com nome e legenda, sem cadastro.

## Rodar no WSL

Com Docker Desktop integrado à sua distribuição WSL (ou Docker Engine + Compose instalado), extraia o projeto para a pasta Linux, por exemplo `~/amanda-party`. No terminal WSL, dentro da pasta:

```bash
bash setup.sh
```

O script usa Python 3, cria `.env` com senhas aleatórias somente se ainda não existir e sobe os três serviços. Abra **http://localhost:3080** no seu PC.

```bash
docker compose ps
docker compose logs -f web
docker compose restart web
docker compose down
```

As fotos e o banco ficam em volumes persistentes. `docker compose down` preserva os dados; não use `down -v` se quiser mantê-los. O console MinIO fica em http://localhost:9091; credenciais no `.env`.

## Compartilhar com os amigos

`localhost` só funciona no seu computador. Para acesso de fora, a porta 3080 precisa estar ligada a um domínio HTTPS por um proxy/túnel. O WSL, Docker e PC precisam permanecer ligados. Configuração de rede depende do seu ambiente e não vem exposta automaticamente por este projeto. Quem tiver o link vê e envia conteúdo. Não há autenticação de convidados.

## Comportamento

- Mural de polaroids com legendas, cores suaves, fita adesiva e pequenos movimentos.
- Rolagem infinita paginada: carrega mais fotos até chegar ao fim do acervo, sem repetir fotos indefinidamente.
- Tocar na foto abre a imagem completa. Enviar uma foto a acrescenta imediatamente ao mural de quem enviou; outros visitantes a veem ao atualizar.
- JPG/PNG/WebP até 12 MB. A API valida decodificando a imagem, ajusta orientação, remove metadados e salva WebP até 1600 px.
- Bucket privado; fotos servidas pela API. Banco e API S3 não têm portas publicadas.
- Limite de 10 envios por minuto por IP. Atrás de proxy, configure `trustProxy` apenas para o proxy confiável se precisar distinguir IPs dos visitantes.
- Animações respeitam a preferência de redução de movimento.

## Remover uma foto

Endpoint administrativo, sem botão público. Use o `ADMIN_TOKEN` do `.env`:

```bash
read -rs -p 'Token administrativo: ' AMANDA_TOKEN
printf '\n'
curl -X DELETE http://localhost:3080/api/momentos/ID_DA_FOTO \
  -H "Authorization: Bearer $AMANDA_TOKEN"
unset AMANDA_TOKEN
```

O ID aparece em `GET /api/momentos`. Não compartilhe o token nem o `.env`.

## Desenvolvimento

`npm ci` e `npm run build` verificam TypeScript e compilam a interface. Para editar com atualização automática, rode `npm run dev`; o Vite encaminha `/api` para localhost:3000. Para API fora do container, exporte as variáveis do `.env` e use DB_HOST/MINIO_HOST e portas acessíveis localmente. O caminho mais simples para testar o conjunto é `docker compose up -d --build`.

Cores e aparência: `src/style.css`. Textos e comportamento: `src/main.tsx`. API e tabelas: `server/index.ts`. Containers: `compose.yaml`.

## Verificação desta entrega

Build e checagem TypeScript executados no ambiente de criação. Docker indisponível nesse ambiente: inicialização dos containers, upload real e persistência precisam ser verificados no WSL. Depois de subir, envie uma foto, recarregue a página e reinicie os serviços para conferir persistência.
