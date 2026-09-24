# Landing page e GitHub Pages

## Localização

O site de produto está em `site/` e não depende do frontend React do desktop:

```text
site/
  index.html
  styles.css
  script.js
  assets/magnetar-icon.png
```

Isso permite publicar a mesma página diretamente no GitHub Pages.

## Links de download

Edite `site/script.js` após uma release para substituir os placeholders `#` pelos links de artefatos reais:

```js
const DOWNLOADS = {
  windows: { url: "https://github.com/<org>/<repo>/releases/download/v1.0.0/Magnetares-Notes-Windows.exe" },
  macos: { url: "https://github.com/<org>/<repo>/releases/download/v1.0.0/Magnetares-Notes-macOS-universal.zip" },
  linux: { url: "https://github.com/<org>/<repo>/releases/download/v1.0.0/Magnetares-Notes-Linux-x64.tar.gz" }
};
```

Mantenha também rótulo, metadados e requisitos de plataforma alinhados à release.

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