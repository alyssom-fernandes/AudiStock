"""Gera de novo as imagens de docs/telas a partir da demonstração.

    python testes/capturas.py            # sobe o servidor local na porta 4173
    python testes/capturas.py 8210       # ou em outra porta

Rode depois de qualquer mudança em js/demo.js ou no visual. Só usa a
demonstração (?demo=1): nada é enviado a servidor nenhum.

Precisa de Python 3 com Playwright (e um Chromium instalado), Pillow e
PyMuPDF (fitz, só para a imagem do PDF). O Node precisa estar no PATH,
para o servidor estático de testes/servidor.mjs. Não faz parte do npm test
nem das dependências do projeto.
Nomes gerados: capa, celular, contagem, dashboard-claro, dashboard-escuro,
relatorio, pdf e og (png).
"""
import io, json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:   # versões antigas do PyMuPDF
    import fitz
from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'docs' / 'telas'
PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
BASE = f'http://localhost:{PORTA}/'
QUANTIDADE = '12,350'
FUNDO_CAPA = (226, 226, 223)


def servidor():
    proc = subprocess.Popen(['node', 'testes/servidor.mjs', str(PORTA)], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + 'login.html', timeout=1)
            return proc
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    raise RuntimeError('o servidor local não subiu')


def contexto(browser, tema, largura, altura, escala, **extra):
    ctx = browser.new_context(viewport={'width': largura, 'height': altura}, device_scale_factor=escala, locale='pt-BR',
                              timezone_id='America/Sao_Paulo', color_scheme=tema, service_workers='block', **extra)
    ctx.add_init_script(f"try{{localStorage.setItem('audistock-theme','{tema}')}}catch(e){{}}")
    return ctx


def id_auditoria(page, final):
    return page.evaluate("""(f) => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas.auditorias
        .find(a => a.numero_auditoria.endsWith(f)).id""", final)


def pronto(page):
    page.wait_for_load_state('networkidle')
    page.wait_for_function("() => !document.querySelector('.carregando-bloco, .skel')", timeout=10000)
    page.wait_for_timeout(400)


def abrir(page, caminho):
    page.goto(BASE + caminho + ('&' if '?' in caminho else '?') + 'demo=1')
    pronto(page)


def contagem(page):
    page.goto(BASE + f"contagem.html?id={id_auditoria(page, '0007')}")
    pronto(page)
    # Um produto de unidade fracionada (KG) que ainda não foi contado nesta auditoria
    codigo = page.evaluate("""() => {
        const t = JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
        const aud = t.auditorias.find(a => a.numero_auditoria.endsWith('0007'));
        const contados = new Set(t.auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
        const livres = t.produtos.filter(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
        return (livres.find(p => p.unidade_medida === 'KG') ?? livres[0]).codigo_produto;
    }""")
    page.fill('#codigoInput', codigo)
    page.locator('#sug li[data-i]').first.click()
    page.fill('#qtdInput', QUANTIDADE)
    page.evaluate("() => document.activeElement?.blur()")
    page.wait_for_timeout(300)


def relatorio(page):
    page.goto(BASE + f"relatorios.html?id={id_auditoria(page, '0006')}")
    pronto(page)


def foto(page, nome):
    page.screenshot(path=str(SAIDA / f'{nome}.png'))
    print('gerada', nome)


def arredondar(img, raio):
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, img.width - 1, img.height - 1), raio, fill=255)
    img = img.convert('RGBA'); img.putalpha(mascara)
    return img


def colar_com_sombra(base, img, xy, raio_sombra=18):
    sombra = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle((xy[0], xy[1] + 8, xy[0] + img.width, xy[1] + img.height + 8), 12, fill=(0, 0, 0, 55))
    base.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(raio_sombra)))
    base.alpha_composite(img, xy)


def capa(desktop_png, celular_png):
    capa = Image.new('RGBA', (1600, 900), FUNDO_CAPA + (255,))
    janela = Image.open(desktop_png).convert('RGB').resize((1072, 644), Image.LANCZOS)
    colar_com_sombra(capa, arredondar(janela, 10), (60, 128))
    # Celular: moldura escura com a tela recortada no topo da captura
    moldura = Image.new('RGBA', (382, 800), (17, 17, 16, 255))
    tela = Image.open(celular_png).convert('RGB').resize((358, 776), Image.LANCZOS)
    moldura.paste(arredondar(tela, 40), (12, 12), arredondar(tela, 40))
    colar_com_sombra(capa, arredondar(moldura, 52), (1146, 50), 22)
    capa.convert('RGB').save(SAIDA / 'capa.png', optimize=True)
    print('gerada capa')


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    proc = servidor()
    tmp = tempfile.mkdtemp(prefix='audistock-capturas-')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                # Computador, 1366x820 em dobro
                for tema, nome in (('dark', 'dashboard-escuro'), ('light', 'dashboard-claro')):
                    ctx = contexto(browser, tema, 1366, 820, 2); page = ctx.new_page()
                    abrir(page, 'app.html?tela=dashboard'); foto(page, nome); ctx.close()
                ctx = contexto(browser, 'dark', 1366, 820, 2); page = ctx.new_page()
                abrir(page, 'app.html?tela=dashboard'); contagem(page); foto(page, 'contagem'); ctx.close()

                ctx = contexto(browser, 'light', 1366, 820, 2, accept_downloads=True); page = ctx.new_page()
                abrir(page, 'app.html?tela=dashboard'); relatorio(page); foto(page, 'relatorio')
                page.screenshot(path=str(Path(tmp) / 'capa-desktop.png'))   # mesma tela, para a capa
                # PDF: baixa o que o botão gera e desenha a primeira página
                with page.expect_download(timeout=60000) as d:
                    page.get_by_role('button', name='PDF').click()
                d.value.save_as(Path(tmp) / 'relatorio.pdf')
                ctx.close()
                doc = fitz.open(Path(tmp) / 'relatorio.pdf')
                pagina = doc[0]
                pix = pagina.get_pixmap(matrix=fitz.Matrix(900 / pagina.rect.width, 900 / pagina.rect.width))
                Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB').save(SAIDA / 'pdf.png', optimize=True)
                doc.close(); print('gerada pdf')

                # Imagem de compartilhamento: relatório escuro, 1200x630
                ctx = contexto(browser, 'dark', 1200, 630, 1); page = ctx.new_page()
                abrir(page, 'app.html?tela=dashboard'); relatorio(page); foto(page, 'og'); ctx.close()

                # Celular, 375x812 em dobro
                ctx = contexto(browser, 'dark', 375, 812, 2, is_mobile=True, has_touch=True); page = ctx.new_page()
                abrir(page, 'app.html?tela=dashboard'); contagem(page); foto(page, 'celular'); ctx.close()
            finally:
                browser.close()
        capa(Path(tmp) / 'capa-desktop.png', SAIDA / 'celular.png')
    finally:
        proc.terminate()
        import shutil; shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
