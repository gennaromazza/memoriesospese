// Disegno vettoriale riproducibile: il testo resta dinamico, nessuna immagine di nomi prefissati.
export function drawMonogram(canvas, first, second) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(canvas.width / 1600, canvas.height / 1100);
  ctx.strokeStyle = ctx.fillStyle = '#654021'; ctx.lineWidth = 4;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(530, 550); ctx.lineTo(1070, 550); ctx.moveTo(800, 280); ctx.lineTo(800, 820); ctx.stroke();
  function leaf(x, y, angle, length = 39, width = 11) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-width, -length * .42, -width * .7, -length * .8, 0, -length);
    ctx.bezierCurveTo(width * .7, -length * .8, width, -length * .42, 0, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -length + 5); ctx.stroke(); ctx.restore();
  }
  function twig(points, leaves) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    ctx.bezierCurveTo(...points[1], ...points[2], ...points[3]); ctx.stroke();
    for (const [x, y, angle, length] of leaves) leaf(x, y, angle, length);
    const tip = points[3]; ctx.beginPath(); ctx.arc(tip[0], tip[1] - 6, 5, 0, Math.PI * 2); ctx.stroke();
  }
  function foliage(rotation) {
    ctx.save(); ctx.translate(800, 550); ctx.rotate(rotation);
    twig([[4,-4],[38,-36],[154,-152],[187,-202]], [[36,-34,-.6,38],[43,-45,1.1,44],[68,-67,-.7,43],[78,-80,1.05,42],[108,-108,-.65,41],[120,-126,1.05,40],[151,-159,-.55,33],[159,-171,.9,33]]);
    twig([[5,-10],[40,-90],[29,-182],[20,-245]], [[20,-74,-.5,37],[28,-105,1,42],[27,-142,-.48,37],[25,-171,.8,36],[22,-200,-.6,32]]);
    twig([[15,-9],[100,-38],[171,-35],[243,-20]], [[70,-26,-.45,40],[99,-31,1.8,36],[130,-32,-.15,45],[160,-30,1.75,34],[190,-27,.1,36],[216,-24,1.4,32]]);
    twig([[27,-29],[63,-95],[72,-150],[79,-206]], [[47,-73,-.6,31],[58,-102,.8,35],[66,-134,-.5,30],[73,-162,.75,33]]);
    twig([[79,-79],[126,-91],[193,-101],[232,-86]], [[130,-92,-.25,36],[159,-94,1.7,29],[188,-94,.2,36],[209,-90,1.7,26]]);
    ctx.restore();
  }
  foliage(0); foliage(Math.PI);
  const names = [first, second].map(value => value.trim().normalize('NFC'));
  const initial = value => Array.from(value).find(c => /\p{L}|\p{N}/u.test(c))?.toLocaleUpperCase('it-IT') || '';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '170px Georgia, serif'; ctx.fillText(initial(names[0]), 667, 420); ctx.fillText(initial(names[1]), 933, 718);
  function name(value, x, y) {
    const letters = Array.from(value.toLocaleUpperCase('it-IT')); if (!letters.length) return;
    let size = 29, spacing = 8;
    const measure = () => letters.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + (letters.length - 1) * spacing;
    ctx.font = `${size}px Georgia, serif`;
    while (measure() > 236 && size > 8) { size--; spacing = Math.max(1, size * .27); ctx.font = `${size}px Georgia, serif`; }
    const fit = Math.min(1, 236 / measure());
    ctx.save(); ctx.translate(x, y); ctx.scale(fit, 1); ctx.textAlign = 'left';
    let cursor = -measure() / 2;
    for (const c of letters) { ctx.fillText(c, cursor, 0); cursor += ctx.measureText(c).width + spacing; }
    ctx.restore();
  }
  name(names[0], 667, 507); name(names[1], 933, 595);
  ctx.restore();
}
