# Landing page e GitHub Pages

## Localização

O site de produto está em `site/` e não depende do frontend React do desktop:

```text
site/
  index.html
  recursos.html
  screenshots.html
  help.html
  blog.html
  post.html
  release.html
  assets/
    css/styles.css
    js/script.js
    img/
```

Isso permite publicar a mesma página diretamente no GitHub Pages.

## Links de download

`site/assets/js/script.js` consulta automaticamente a API de Releases do GitHub para preencher os links reais de download por sistema operacional (**Windows**: Setup `.exe`, `.msi`, executável direto e portátil `.zip`; **Linux**: `.deb`, `.AppImage`, `.flatpak`, `.snap` e `.tar.gz`; **macOS**: `.zip` universal), mantendo fallbacks configurados para a última release estável.

## Publicação

1. Faça commit de alterações em `site/`.
2. Envie para `main`.
3. O workflow `pages.yml` envia a pasta como artefato de Pages.
4. GitHub publica a URL configurada em **Settings > Pages**.

## Validação local

A página pode ser aberta diretamente:

```text
site/index.html
```

Valide pelo menos:

- hero e ícone em desktop e mobile;
- ausência de overflow horizontal;
- seletor de Windows/macOS/Linux;
- links reais antes de anunciar a release;
- favicon e título da página.

## Direção visual

O site usa a arte de magnetar fornecida como sinal de marca: nota luminosa, órbitas e um núcleo cósmico. O hero é escuro e estelar; as seções de leitura usam fundo editorial claro para equilibrar atmosfera e legibilidade.