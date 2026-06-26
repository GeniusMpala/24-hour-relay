const { DateTime } = require("luxon");

const COLORS = {
  gold: "#b1873b",
  goldDeep: "#8d6424",
  blue: "#0d4479",
  text: "#2f261b",
  muted: "#6e6252",
  line: "#d9cdb8",
  openBg: "#eef4e7",
  openText: "#566246",
  bookedBg: "#f8e7e7",
  bookedText: "#9b5c5c",
  headerBg: "#f7f1e4",
  rowAlt: "#fbf8f1",
};

function drawChurchLogo(doc, x, y, width = 180) {
  const scale = width / 520;
  const height = 220 * scale;

  doc.save();
  doc.translate(x, y);
  doc.scale(scale);

  doc
    .lineWidth(6)
    .lineCap("round")
    .lineJoin("round")
    .strokeColor(COLORS.gold)
    .moveTo(86, 58)
    .bezierCurveTo(112, 46, 140, 46, 170, 60)
    .bezierCurveTo(204, 76, 240, 78, 278, 66)
    .bezierCurveTo(296, 60, 313, 51, 330, 51)
    .bezierCurveTo(354, 51, 374, 59, 397, 68)
    .stroke();

  doc
    .moveTo(82, 76)
    .bezierCurveTo(107, 66, 137, 66, 170, 79)
    .bezierCurveTo(205, 92, 241, 94, 278, 83)
    .bezierCurveTo(296, 77, 312, 70, 330, 70)
    .bezierCurveTo(351, 70, 370, 76, 391, 84)
    .stroke();

  doc.fillColor(COLORS.gold).roundedRect(247, 28, 8, 34, 2).fill();
  doc.fillColor(COLORS.gold).roundedRect(236, 38, 30, 8, 2).fill();

  doc.font("Helvetica-Bold").fillColor(COLORS.blue).fontSize(74).text("WISDOM", 0, 88, {
    width: 520,
    align: "center",
  });
  doc.font("Helvetica").fillColor("#111111").fontSize(26).text("and", 0, 150, {
    width: 520,
    align: "center",
  });
  doc.font("Helvetica-Bold").fillColor(COLORS.blue).fontSize(34).text("G R A C E", 0, 178, {
    width: 520,
    align: "center",
  });
  doc.font("Helvetica").fillColor(COLORS.blue).fontSize(18).text("INTERNATIONAL MINISTRIES", 0, 200, {
    width: 520,
    align: "center",
  });

  doc.restore();

  return height;
}

function drawSummaryCard(doc, { x, y, width, height, label, value, accent }) {
  doc.save();
  doc.roundedRect(x, y, width, height, 14).fillAndStroke("#fffdf8", accent);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(label, x + 14, y + 12, {
    width: width - 28,
  });
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(22).text(String(value), x + 14, y + 28, {
    width: width - 28,
  });
  doc.restore();
}

function buildParticipantText(slot) {
  if (!slot.isBooked) {
    return "Open";
  }

  const parts = [slot.booking.full_name, slot.booking.location, slot.booking.contact];
  if (slot.booking.topic) {
    parts.push(`Topic: ${slot.booking.topic}`);
  }

  return parts.join("\n");
}

function drawStatusPill(doc, x, y, isBooked) {
  const text = isBooked ? "Booked" : "Open";
  const bgColor = isBooked ? COLORS.bookedBg : COLORS.openBg;
  const textColor = isBooked ? COLORS.bookedText : COLORS.openText;
  const textWidth = doc.widthOfString(text);
  const pillWidth = textWidth + 18;

  doc.save();
  doc.roundedRect(x, y, pillWidth, 18, 9).fill(bgColor);
  doc.fillColor(textColor).font("Helvetica-Bold").fontSize(8.5).text(text, x, y + 5, {
    width: pillWidth,
    align: "center",
  });
  doc.restore();
}

function drawTableHeader(doc, startY, columns) {
  const left = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  doc.save();
  doc.roundedRect(left, startY, tableWidth, 24, 10).fill(COLORS.headerBg);

  let cursorX = left;
  columns.forEach((column) => {
    doc.fillColor(COLORS.goldDeep).font("Helvetica-Bold").fontSize(8.5).text(column.label, cursorX + 8, startY + 8, {
      width: column.width - 16,
    });
    cursorX += column.width;
  });
  doc.restore();

  return startY + 34;
}

function getRowHeight(doc, row, columns) {
  const textOptions = {
    width: columns[1].width - 16,
    lineGap: 1,
  };

  const heights = [
    doc.heightOfString(row.hourLabel, { width: columns[0].width - 16 }),
    doc.heightOfString(row.zimbabwe, textOptions),
    doc.heightOfString(row.eastern, { width: columns[2].width - 16, lineGap: 1 }),
    20,
    doc.heightOfString(row.participant, { width: columns[4].width - 16, lineGap: 2 }),
  ];

  return Math.max(34, Math.ceil(Math.max(...heights) + 16));
}

function drawTableRow(doc, startY, row, rowIndex, columns) {
  const left = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const rowHeight = getRowHeight(doc, row, columns);

  doc.save();
  doc
    .roundedRect(left, startY, tableWidth, rowHeight, 10)
    .fillAndStroke(rowIndex % 2 === 0 ? "#ffffff" : COLORS.rowAlt, COLORS.line);

  let cursorX = left;

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9.5).text(row.hourLabel, cursorX + 8, startY + 10, {
    width: columns[0].width - 16,
  });
  cursorX += columns[0].width;

  doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.8).text(row.zimbabwe, cursorX + 8, startY + 10, {
    width: columns[1].width - 16,
    lineGap: 1,
  });
  cursorX += columns[1].width;

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.8).text(row.eastern, cursorX + 8, startY + 10, {
    width: columns[2].width - 16,
    lineGap: 1,
  });
  cursorX += columns[2].width;

  drawStatusPill(doc, cursorX + 8, startY + 9, row.isBooked);
  cursorX += columns[3].width;

  doc.fillColor(COLORS.text).font(row.isBooked ? "Helvetica" : "Helvetica-Oblique").fontSize(8.5).text(
    row.participant,
    cursorX + 8,
    startY + 10,
    {
      width: columns[4].width - 16,
      lineGap: 2,
    }
  );

  doc.restore();

  return startY + rowHeight + 8;
}

function addPageShell(doc, eventDate, pageNumber) {
  const marginLeft = doc.page.margins.left;
  const contentWidth = doc.page.width - marginLeft - doc.page.margins.right;
  const logoHeight = drawChurchLogo(doc, marginLeft, 28, 170);
  const headingX = marginLeft + 190;

  doc.fillColor(COLORS.goldDeep).font("Helvetica-Bold").fontSize(10).text("ADMIN SCHEDULE EXPORT", headingX, 40, {
    width: contentWidth - 190,
  });
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(24).text("24-Hour Prayer Marathon", headingX, 58, {
    width: contentWidth - 190,
  });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11).text(
    `Prayer date: ${eventDate}\nGenerated: ${DateTime.local().toFormat("MMM d, yyyy 'at' h:mm a")}`,
    headingX,
    92,
    {
      width: contentWidth - 190,
      lineGap: 4,
    }
  );

  if (pageNumber > 1) {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(10).text(`Page ${pageNumber}`, headingX, 142, {
      width: contentWidth - 190,
      align: "right",
    });
  }

  return Math.max(28 + logoHeight, 156);
}

function renderPrayerSchedulePdf(doc, { eventDate, slots }) {
  const marginLeft = doc.page.margins.left;
  const contentWidth = doc.page.width - marginLeft - doc.page.margins.right;
  const bookedCount = slots.filter((slot) => slot.isBooked).length;
  const openCount = slots.length - bookedCount;
  const columns = [
    { label: "Hour", width: 54 },
    { label: "Zimbabwe Time", width: 136 },
    { label: "USA Eastern", width: 136 },
    { label: "Status", width: 64 },
    { label: "Participant", width: 125 },
  ];

  let pageNumber = 1;
  let cursorY = addPageShell(doc, eventDate, pageNumber);

  drawSummaryCard(doc, {
    x: marginLeft,
    y: cursorY,
    width: 116,
    height: 62,
    label: "Booked hours",
    value: bookedCount,
    accent: COLORS.bookedText,
  });
  drawSummaryCard(doc, {
    x: marginLeft + 128,
    y: cursorY,
    width: 116,
    height: 62,
    label: "Open hours",
    value: openCount,
    accent: COLORS.openText,
  });
  drawSummaryCard(doc, {
    x: marginLeft + 256,
    y: cursorY,
    width: contentWidth - 256,
    height: 62,
    label: "Church",
    value: "Wisdom and Grace International Ministries",
    accent: COLORS.gold,
  });

  cursorY += 82;
  cursorY = drawTableHeader(doc, cursorY, columns);

  slots.forEach((slot, rowIndex) => {
    const row = {
      hourLabel: `${String(slot.hour).padStart(2, "0")}:00`,
      zimbabwe: slot.zimbabwe.label,
      eastern: slot.eastern.label,
      isBooked: slot.isBooked,
      participant: buildParticipantText(slot),
    };

    const rowHeight = getRowHeight(doc, row, columns);
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    if (cursorY + rowHeight > bottomLimit) {
      doc.addPage();
      pageNumber += 1;
      cursorY = addPageShell(doc, eventDate, pageNumber);
      cursorY = drawTableHeader(doc, cursorY + 8, columns);
    }

    cursorY = drawTableRow(doc, cursorY, row, rowIndex, columns);
  });
}

module.exports = {
  renderPrayerSchedulePdf,
};
