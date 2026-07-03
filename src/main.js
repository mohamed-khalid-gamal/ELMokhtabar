const values = ["-", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "+"];
const defaultRatings = [1, 2, 7];
const ratings = [...defaultRatings];

function chipClass(value) {
  const number = Number(value);
  if (value === "+" || number >= 9) return "rating-chip--green";
  if (number >= 7) return "rating-chip--orange";
  return "rating-chip--red";
}

function renderReasons(question) {
  const selected = ratings[Number(question.dataset.question)];
  const panel = question.querySelector(".reason-panel");
  panel.classList.toggle("is-visible", Number.isFinite(selected) && selected <= 6);
}

document.querySelectorAll(".survey-question[data-question]").forEach((question) => {
  const index = Number(question.dataset.question);
  const row = question.querySelector(".rating-row");

  for (const value of values) {
    const isControl = value === "-" || value === "+";
    const chip = document.createElement(isControl ? "span" : "button");
    chip.textContent = value;
    chip.className = `rating-chip ${chipClass(value)}`;

    if (isControl) {
      chip.classList.add("rating-chip--round");
    } else {
      chip.type = "button";
      chip.dataset.value = value;
      chip.setAttribute("aria-pressed", String(Number(value) === defaultRatings[index]));
      chip.classList.toggle("is-selected", Number(value) === defaultRatings[index]);
      chip.addEventListener("click", () => {
        ratings[index] = Number(value);
        row.querySelectorAll("button").forEach((button) => {
          const isSelected = button.dataset.value === value;
          button.classList.toggle("is-selected", isSelected);
          button.setAttribute("aria-pressed", String(isSelected));
        });
        renderReasons(question);
      });
    }

    row.append(chip);
  }

  renderReasons(question);
});

const sideMenu = document.querySelector(".side-menu");
const mask = document.querySelector(".menu-mask");
const hamburger = document.querySelector(".hamburger");
const closeMenu = document.querySelector(".side-menu__close");

function setMenu(open) {
  sideMenu.classList.toggle("is-open", open);
  sideMenu.setAttribute("aria-hidden", String(!open));
  mask.hidden = !open;
}

hamburger.addEventListener("click", () => setMenu(true));
closeMenu.addEventListener("click", () => setMenu(false));
mask.addEventListener("click", () => setMenu(false));

document.querySelector(".result-row").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const details = document.querySelector(".result-details");
  const open = details.hidden;
  details.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
});

function textAfter(label) {
  const rows = [...document.querySelectorAll(".patient-copy p")];
  const row = rows.find((item) => item.textContent.includes(label));
  return row?.querySelector("span")?.textContent.trim() || "";
}

function makeQrMatrix(text) {
  const version = 5;
  const size = 17 + version * 4;
  const dataCodewords = 108;
  const eccCodewords = 26;
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const pushBits = (value, length) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1);
  };

  pushBits(4, 4);
  pushBits(bytes.length, 8);
  bytes.forEach((byte) => pushBits(byte, 8));
  for (let i = 0; i < Math.min(4, dataCodewords * 8 - bits.length); i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let pad = 0; data.length < dataCodewords; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

  const exp = Array(512).fill(0);
  const log = Array(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
  const mul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);

  let gen = [1];
  for (let i = 0; i < eccCodewords; i += 1) {
    const next = Array(gen.length + 1).fill(0);
    gen.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= mul(coefficient, exp[i]);
    });
    gen = next;
  }

  const ecc = Array(eccCodewords).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ ecc.shift();
    ecc.push(0);
    gen.slice(1).forEach((coefficient, index) => {
      ecc[index] ^= mul(coefficient, factor);
    });
  });

  const codewords = [...data, ...ecc];
  let matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, dark, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y][x] = dark;
    if (reserve) reserved[y][x] = true;
  };

  const finder = (x, y) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const dark =
          dx >= 0 &&
          dx <= 6 &&
          dy >= 0 &&
          dy <= 6 &&
          (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(xx, yy, dark);
      }
    }
  };

  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let i = 8; i < size - 8; i += 1) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }

  const alignment = (cx, cy) => {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) set(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  };
  alignment(30, 30);
  set(8, 29, true);

  const formatAt = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const formatAt2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8], [size - 8, 8],
    [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4],
    [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  [...formatAt, ...formatAt2].forEach(([x, y]) => {
    if (!reserved[y][x]) set(x, y, false);
  });

  let stream = [];
  codewords.forEach((byte) => {
    for (let bit = 7; bit >= 0; bit -= 1) stream.push((byte >>> bit) & 1);
  });
  let bitIndex = 0;
  let upward = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x -= 1;
    for (let row = 0; row < size; row += 1) {
      const y = upward ? size - 1 - row : row;
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx;
        if (!reserved[y][xx]) {
          matrix[y][xx] = bitIndex < stream.length ? stream[bitIndex] === 1 : false;
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }

  const masks = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
  ];
  const mask = 0;
  matrix = matrix.map((row, y) => row.map((cell, x) => (reserved[y][x] ? cell : Boolean(cell) !== masks[mask](x, y))));

  const formatBits = (() => {
    let dataBits = (1 << 3) | mask;
    let bitsValue = dataBits << 10;
    for (let i = 14; i >= 10; i -= 1) {
      if ((bitsValue >>> i) & 1) bitsValue ^= 0x537 << (i - 10);
    }
    return ((dataBits << 10) | bitsValue) ^ 0x5412;
  })();
  for (let i = 0; i < 15; i += 1) {
    const bit = ((formatBits >>> i) & 1) === 1;
    set(formatAt[i][0], formatAt[i][1], bit);
    set(formatAt2[i][0], formatAt2[i][1], bit);
  }
  return matrix;
}

function drawQr(ctx, text, x, y, size) {
  const matrix = makeQrMatrix(text.slice(0, 105));
  const modules = matrix.length;
  const quiet = 4;
  const cell = size / (modules + quiet * 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#000";
  matrix.forEach((row, yy) => {
    row.forEach((dark, xx) => {
      if (dark) ctx.fillRect(x + (xx + quiet) * cell, y + (yy + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
    });
  });
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || "#111";
  ctx.font = options.font || "bold 10px Arial";
  ctx.textAlign = options.align || "left";
  ctx.direction = options.direction || "ltr";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawHeartLogo(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.fillStyle = "#df101c";
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-0.5);
  ctx.fillStyle = "#ffe538";
  ctx.beginPath();
  ctx.moveTo(0, size * 0.26);
  ctx.bezierCurveTo(-size * 0.43, -size * 0.05, -size * 0.27, -size * 0.42, 0, -size * 0.24);
  ctx.bezierCurveTo(size * 0.27, -size * 0.42, size * 0.43, -size * 0.05, 0, size * 0.26);
  ctx.fill();
  ctx.restore();
}

function loadDataImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function makePdfBlob(jpeg, width, height) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const binary = atob(jpeg.split(",")[1]);
  const objects = [];
  const add = (body) => objects.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  add(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n${binary}\nendstream`);
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;
  add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

async function generateResultsPdf() {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = 1190;
  canvas.height = 1684;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 595, 842);
  const template = await loadDataImage(window.PDF_TEMPLATE_IMAGE);
  if (template) ctx.drawImage(template, 0, 0, 595, 842);

  ctx.save();
  ctx.translate(0, -45);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(11, 135, 573, 82);
  ctx.strokeRect(15, 141, 226, 39);
  ctx.strokeRect(244, 141, 336, 47);
  ctx.strokeRect(15, 180, 226, 34);
  ctx.strokeRect(244, 188, 336, 26);
  ctx.beginPath();
  ctx.moveTo(130, 180); ctx.lineTo(130, 214);
  ctx.moveTo(192, 180); ctx.lineTo(192, 214);
  ctx.moveTo(422, 188); ctx.lineTo(422, 214);
  ctx.stroke();

  const patient = textAfter("اسم المريض") || "انتوني مايكل سمير";
  const visit = textAfter("رقم الزيارة") || "24825511301";
  const visitDate = textAfter("تاريخ الزيارة") || "23-06-2025";
  const resultRow = document.querySelector(".result-row");
  const test = resultRow?.querySelector("span:first-child")?.textContent.trim() || "Haemoglobin A1C";
  const result = resultRow?.dataset.result || "7.61";
  const unit = resultRow?.dataset.unit || "%";
  const age = resultRow?.dataset.age || "7 Year";
  const gender = resultRow?.dataset.gender || "Male";
  const clientId = resultRow?.dataset.clientId || "451";
  const registered = resultRow?.dataset.registered || `${visitDate} 17:35:08`;
  const collected = resultRow?.dataset.collected || `${visitDate} 17:35:15`;
  const authenticated = resultRow?.dataset.authenticated || `${visitDate} 21:24:25`;
  const printed = resultRow?.dataset.printed || "03-07-2026 21:45:07";

  drawText(ctx, "PATIENT NAME", 98, 157, { color: "#4385bd", font: "bold 10px Arial" });
  drawText(ctx, patient, 120, 179, { direction: "rtl", align: "center", font: "bold 10px Arial" });
  drawText(ctx, "Registered", 254, 157, { font: "bold 8px Arial" });
  drawText(ctx, registered, 319, 157, { font: "9px Arial" });
  drawText(ctx, "Collected", 429, 157, { font: "bold 8px Arial" });
  drawText(ctx, collected, 497, 157, { font: "9px Arial" });
  drawText(ctx, "Authenticated", 254, 181, { font: "bold 8px Arial" });
  drawText(ctx, authenticated, 319, 181, { font: "9px Arial" });
  drawText(ctx, "Printed", 429, 181, { font: "bold 8px Arial" });
  drawText(ctx, printed, 483, 181, { font: "9px Arial" });

  drawText(ctx, "Visit Number", 45, 197, { font: "bold 9px Arial" });
  drawText(ctx, visit, 42, 213, { font: "10px Arial" });
  drawText(ctx, "Age", 152, 197, { font: "bold 9px Arial" });
  drawText(ctx, age, 146, 213, { font: "10px Arial" });
  drawText(ctx, "Gender", 205, 197, { font: "bold 9px Arial" });
  drawText(ctx, gender, 205, 213, { font: "10px Arial" });
  drawText(ctx, "Referred By", 310, 200, { font: "bold 9px Arial" });
  drawText(ctx, "Prof : -", 320, 213, { font: "10px Arial" });
  drawText(ctx, "Client ID", 490, 200, { font: "bold 9px Arial" });
  drawText(ctx, clientId, 490, 213, { font: "10px Arial" });

  drawText(ctx, "Test Name", 18, 238, { font: "bold 11px Arial" });
  drawText(ctx, "Result", 214, 238, { font: "bold 11px Arial" });
  drawText(ctx, "Unit", 304, 238, { font: "bold 11px Arial" });
  drawText(ctx, "Reference Range", 354, 238, { font: "bold 11px Arial" });
  drawText(ctx, "Previous Result", 514, 238, { font: "bold 11px Arial" });
  ctx.fillStyle = "#e2dada";
  ctx.fillRect(11, 245, 573, 16);
  ctx.strokeRect(11, 245, 573, 16);
  drawText(ctx, "Diabetic Profile", 13, 258, { font: "bold 9px Arial" });
  drawText(ctx, test, 13, 284, { font: "bold 11px Arial", color: "#333" });
  drawText(ctx, result, 216, 284, { font: "bold 11px Arial" });
  drawText(ctx, unit, 305, 284, { font: "bold 11px Arial" });
  drawText(ctx, "Normal: Less than 5.7", 357, 284, { font: "bold 9px Arial" });
  drawText(ctx, "Prediabetes: 5.7 - 6.4", 357, 296, { font: "bold 9px Arial" });
  drawText(ctx, "Diabetes: More than 6.4", 357, 308, { font: "bold 9px Arial" });
  drawText(ctx, "Lipid profile, Kidney function tests and Microalbuminuria are recommended", 12, 330, { font: "bold 10px Arial" });
  ctx.beginPath();
  ctx.moveTo(11, 337);
  ctx.lineTo(584, 337);
  ctx.stroke();
  ctx.restore();

  const qrUrl = window.location.href;
  ctx.fillStyle = "#111";
  ctx.fillRect(35, 690, 100, 113);
  drawText(ctx, "Scan me!", 85, 706, { font: "bold 13px Arial", color: "#fff", align: "center" });
  drawQr(ctx, qrUrl, 43, 711, 84);

  ctx.strokeStyle = "#2e65a8";
  ctx.lineWidth = 1.4;

  return makePdfBlob(canvas.toDataURL("image/jpeg", 0.92), canvas.width, canvas.height);
}

document.querySelector(".download").addEventListener("click", async () => {
  const visit = textAfter("رقم الزيارة") || "24825511301";
  const blob = await generateResultsPdf();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Test-results-${visit}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

document.querySelector(".submit").addEventListener("click", () => {
  const selectedReasons = [...document.querySelectorAll(".reason-panel input:checked")].map((input) => input.value);
  const message = document.querySelector(".form-message");
  const missing = ratings.findIndex((rating) => !Number.isFinite(rating));

  if (missing !== -1) {
    message.textContent = "برجاء اختيار تقييم لكل سؤال.";
    message.className = "form-message is-error";
    return;
  }

  message.textContent = `تم تسجيل الاستطلاع. التقييمات: ${ratings.join(" / ")}${selectedReasons.length ? " - الأسباب: " + selectedReasons.join("، ") : ""}`;
  message.className = "form-message is-success";
});

document.querySelector(".pay").addEventListener("click", () => {});
