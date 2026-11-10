// The DICOM inputs of the cli bench, built in code from an index. No file is read, and every name,
// identifier, date and pixel is made up. Adapted from the shapes @cosyte/dicom's own bench reads
// (cosyte/dicom, bench/shapes.mjs), so the cli is measured on the same traffic as the library
// under it:
// - `worklistItem`: a Modality Worklist entry of about 1 KiB, stored as a Part 10 file;
// - `ctImage`: one CT slice, 512 by 512 pixels of 16 bits (512 KiB of native Pixel Data);
// - `enhancedCt`: an Enhanced CT multi-frame object, `frames` frames of 512 by 512 by 16 bits in
//   one Pixel Data element, with one Per-frame Functional Groups Item a frame;
// - `srDocument`: a Comprehensive SR with no Pixel Data: `measurements` NUM content items, every
//   sequence and Item of undefined length. Many small tags, nested four deep.
//
// Every file is Explicit VR Little Endian, with a 128-byte preamble, `DICM` and a File Meta group,
// in ascending tag order. UIDs are under the 2.25 root, from the index.

import { Buffer } from "node:buffer";

const EXPLICIT_VR_LE = "1.2.840.10008.1.2.1";
const MODALITY_WORKLIST_FIND = "1.2.840.10008.5.1.4.31";
const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";
const ENHANCED_CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2.1";
const COMPREHENSIVE_SR_STORAGE = "1.2.840.10008.5.1.4.1.1.88.33";
const IMPLEMENTATION_CLASS_UID = "2.25.1000000000000000000000000000001";

/** The VRs written with a reserved field and a 32-bit length (PS3.5 2026c section 7.1.2). */
const LONG_FORM = new Set([
  "OB",
  "OD",
  "OF",
  "OL",
  "OV",
  "OW",
  "SQ",
  "SV",
  "UC",
  "UN",
  "UR",
  "UT",
  "UV",
]);
/** The VRs padded with a NUL rather than a space to an even length (PS3.5 2026c section 6.2). */
const NUL_PADDED = new Set(["UI", "OB", "OD", "OF", "OL", "OV", "OW", "UN"]);

const UNDEFINED_LENGTH = 0xffffffff;

/** A synthetic UID under 2.25: the kind, then the index, so every object has its own. */
function uid(kind, i) {
  return `2.25.${String(kind)}${String(i).padStart(12, "0")}`;
}

function tagHeader(tag) {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(Number.parseInt(tag.slice(0, 4), 16), 0);
  head.writeUInt16LE(Number.parseInt(tag.slice(4, 8), 16), 2);
  return head;
}

/** One Explicit VR Little Endian Data Element, its value padded to an even length. */
function element(tag, vr, value) {
  let bytes = value;
  if (bytes.length % 2 === 1) {
    bytes = Buffer.concat([bytes, Buffer.from([NUL_PADDED.has(vr) ? 0x00 : 0x20])]);
  }
  const head = Buffer.alloc(LONG_FORM.has(vr) ? 12 : 8);
  tagHeader(tag).copy(head, 0);
  head.write(vr, 4, "latin1");
  if (LONG_FORM.has(vr)) head.writeUInt32LE(bytes.length, 8);
  else head.writeUInt16LE(bytes.length, 6);
  return Buffer.concat([head, bytes]);
}

/** A text or UID element. */
function text(tag, vr, value) {
  return element(tag, vr, Buffer.from(value, "latin1"));
}

function us(tag, ...values) {
  const value = Buffer.alloc(2 * values.length);
  values.forEach((v, k) => value.writeUInt16LE(v, 2 * k));
  return element(tag, "US", value);
}

function ul(tag, ...values) {
  const value = Buffer.alloc(4 * values.length);
  values.forEach((v, k) => value.writeUInt32LE(v, 4 * k));
  return element(tag, "UL", value);
}

/**
 * A Sequence of Items, each Item the concatenated elements of its Data Set. Defined lengths by
 * default; `undefinedLength` writes every Item and the Sequence with undefined length and their
 * delimitation items, as many SR producers do.
 */
function sequence(tag, items, undefinedLength = false) {
  const parts = [];
  for (const content of items) {
    const body = Buffer.concat(content);
    const head = Buffer.alloc(8);
    head.writeUInt16LE(0xfffe, 0);
    head.writeUInt16LE(0xe000, 2);
    head.writeUInt32LE(undefinedLength ? UNDEFINED_LENGTH : body.length, 4);
    parts.push(head, body);
    if (undefinedLength) parts.push(delimiter(0xe00d));
  }
  if (undefinedLength) parts.push(delimiter(0xe0dd));
  const value = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  tagHeader(tag).copy(head, 0);
  head.write("SQ", 4, "latin1");
  head.writeUInt32LE(undefinedLength ? UNDEFINED_LENGTH : value.length, 8);
  return Buffer.concat([head, value]);
}

function delimiter(element) {
  const bytes = Buffer.alloc(8);
  bytes.writeUInt16LE(0xfffe, 0);
  bytes.writeUInt16LE(element, 2);
  return bytes;
}

/** A coded concept Item: Code Value, Coding Scheme Designator, Code Meaning. */
function code(value, scheme, meaning) {
  return [
    text("00080100", "SH", value),
    text("00080102", "SH", scheme),
    text("00080104", "LO", meaning),
  ];
}

/** A Part 10 file: preamble, `DICM`, the File Meta group with its group length, then the body. */
function part10(sopClassUid, sopInstanceUid, body) {
  const meta = Buffer.concat([
    element("00020001", "OB", Buffer.from([0x00, 0x01])),
    text("00020002", "UI", sopClassUid),
    text("00020003", "UI", sopInstanceUid),
    text("00020010", "UI", EXPLICIT_VR_LE),
    text("00020012", "UI", IMPLEMENTATION_CLASS_UID),
    text("00020013", "SH", "SYNTH_BENCH_1"),
  ]);
  const groupLength = ul("00020000", meta.length);
  return Buffer.concat([
    Buffer.alloc(128),
    Buffer.from("DICM", "latin1"),
    groupLength,
    meta,
    ...body,
  ]);
}

/** A synthetic patient name, from the allow-listed synthetic family. */
function patientName(i) {
  return `SYNTHETIC^PATIENT^${String(i % 10_000).padStart(4, "0")}`;
}

/** The patient and study module elements every object here shares, in tag order up to group 0010. */
function patientElements(i) {
  return [
    text("00100010", "PN", patientName(i)),
    text("00100020", "LO", `SYN${String(i).padStart(8, "0")}`),
    text("00100021", "LO", "SYNTHETIC_ISSUER"),
    text("00100030", "DA", "19800101"),
    text("00100040", "CS", i % 2 === 0 ? "F" : "M"),
  ];
}

/**
 * A Modality Worklist entry of about 1 KiB: the requested procedure, the patient and one Scheduled
 * Procedure Step, as a worklist server stores it and hands it to a modality.
 */
export function worklistItem(i) {
  const step = [
    text("00080060", "CS", i % 3 === 0 ? "MR" : "CT"),
    text("00400001", "AE", "SYNTH_MOD_01"),
    text("00400002", "DA", "20240115"),
    text("00400003", "TM", `${String(8 + (i % 10)).padStart(2, "0")}3000`),
    text("00400006", "PN", "SYNTHETIC^TECHNOLOGIST"),
    text("00400007", "LO", "CT CHEST WITHOUT CONTRAST"),
    sequence("00400008", [code("SYN-CT-001", "99SYNTH", "CT chest without contrast")]),
    text("00400009", "SH", `SPS${String(i).padStart(8, "0")}`),
    text("00400010", "SH", "SYNTH_STATION"),
    text("00400011", "SH", "SYNTH SUITE 1"),
  ];
  const body = [
    text("00080005", "CS", "ISO_IR 100"),
    text("00080050", "SH", `ACC${String(i).padStart(8, "0")}`),
    text("00080090", "PN", "SYNTHETIC^REFERRING"),
    sequence("00081110", []),
    ...patientElements(i),
    text("00101030", "DS", String(60 + (i % 40))),
    text("00102000", "LO", ""),
    text("00102110", "LO", ""),
    text("00104000", "LT", "Synthetic worklist entry for benchmarking."),
    text("0020000D", "UI", uid(1, i)),
    text("00321032", "PN", "SYNTHETIC^REQUESTING"),
    text("00321060", "LO", "CT CHEST"),
    sequence("00321064", [code("SYN-CT-001", "99SYNTH", "CT chest without contrast")]),
    text("00380010", "LO", `ADM${String(i).padStart(8, "0")}`),
    sequence("00400100", [step]),
    text("00401001", "SH", `RP${String(i).padStart(8, "0")}`),
    text("00401003", "SH", "ROUTINE"),
  ];
  return part10(MODALITY_WORKLIST_FIND, uid(2, i), body);
}

/**
 * `frames` frames of 512 by 512 unsigned 16-bit pixels: a smooth field with a disc in it, each frame
 * shifted by its index so no two frames are the same bytes. One frame is computed and the rest
 * copied from it, so a 100 MiB build stays under a second.
 */
function pixelData(i, frames) {
  const side = 512;
  const frame = Buffer.alloc(side * side * 2);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x - 256;
      const dy = y - 256;
      const inside = dx * dx + dy * dy < 160 * 160;
      const value = (inside ? 1_000 : 0) + ((x * 3 + y * 5 + i * 7) & 0x3ff);
      frame.writeUInt16LE(value, 2 * (y * side + x));
    }
  }
  const all = Buffer.allocUnsafe(frame.length * frames);
  for (let f = 0; f < frames; f++) {
    frame.copy(all, f * frame.length);
    // The first row of each frame carries the frame index, so frames differ.
    all.writeUInt16LE(f & 0xffff, f * frame.length);
  }
  return all;
}

/** The General Equipment, Frame of Reference and private elements the CT shapes share. */
function equipmentElements() {
  return [
    text("00080070", "LO", "SYNTHETIC MANUFACTURER"),
    text("00080080", "LO", "SYNTHETIC HOSPITAL"),
    text("00080090", "PN", "SYNTHETIC^REFERRING"),
  ];
}

/** A private block of a made-up creator, so the reservation path is on every read. */
function privateBlock(i) {
  return [
    text("00090010", "LO", "SYNTHETIC VENDOR 1"),
    text("00091001", "LO", "SYNTH PROTOCOL"),
    us("00091002", i & 0xffff),
    text("00091003", "DS", "1.5"),
  ];
}

/** One CT slice: about 80 header elements and 512 by 512 by 16-bit native Pixel Data, 514 KiB. */
export function ctImage(i) {
  const study = uid(1, i >> 6);
  const series = uid(3, i >> 4);
  const body = [
    text("00080005", "CS", "ISO_IR 100"),
    text("00080008", "CS", "ORIGINAL\\PRIMARY\\AXIAL"),
    text("00080012", "DA", "20240115"),
    text("00080013", "TM", "093000"),
    text("00080016", "UI", CT_IMAGE_STORAGE),
    text("00080018", "UI", uid(4, i)),
    text("00080020", "DA", "20240115"),
    text("00080021", "DA", "20240115"),
    text("00080022", "DA", "20240115"),
    text("00080023", "DA", "20240115"),
    text("00080030", "TM", "091500"),
    text("00080031", "TM", "092000"),
    text("00080032", "TM", "092500"),
    text("00080033", "TM", "093000"),
    text("00080050", "SH", `ACC${String(i >> 6).padStart(8, "0")}`),
    text("00080060", "CS", "CT"),
    ...equipmentElements(),
    text("00081010", "SH", "SYNTH_CT_01"),
    sequence("00081032", [code("SYN-CT-001", "99SYNTH", "CT chest without contrast")]),
    text("0008103E", "LO", "AXIAL 1.25MM"),
    text("00081090", "LO", "SYNTHETIC SCANNER"),
    ...privateBlock(i),
    ...patientElements(i >> 6),
    text("00101010", "AS", "044Y"),
    text("00180015", "CS", "CHEST"),
    text("00180050", "DS", "1.25"),
    text("00180060", "DS", "120"),
    text("00180088", "DS", "1.25"),
    text("00180090", "DS", "500"),
    text("00181020", "LO", "SYNTH 1.0"),
    text("00181030", "LO", "CHEST ROUTINE"),
    text("00181100", "DS", "360"),
    text("00181110", "DS", "1040"),
    text("00181111", "DS", "540"),
    text("00181120", "DS", "0"),
    text("00181130", "DS", "150"),
    text("00181140", "CS", "CW"),
    text("00181150", "IS", "500"),
    text("00181151", "IS", "200"),
    text("00181152", "IS", "100"),
    text("00181160", "SH", "BODY FILTER"),
    text("00181170", "IS", "24"),
    text("00181190", "DS", "0.7"),
    text("00181210", "SH", "STANDARD"),
    text("00185100", "CS", "FFS"),
    text("0020000D", "UI", study),
    text("0020000E", "UI", series),
    text("00200010", "SH", "1"),
    text("00200011", "IS", String((i >> 4) % 1000)),
    text("00200012", "IS", "1"),
    text("00200013", "IS", String(i % 1000)),
    text("00200032", "DS", `-250\\-250\\${(-(i % 1000) * 1.25).toFixed(2)}`),
    text("00200037", "DS", "1\\0\\0\\0\\1\\0"),
    text("00200052", "UI", uid(5, i >> 6)),
    text("00201040", "LO", ""),
    text("00201041", "DS", (-(i % 1000) * 1.25).toFixed(2)),
    us("00280002", 1),
    text("00280004", "CS", "MONOCHROME2"),
    us("00280010", 512),
    us("00280011", 512),
    text("00280030", "DS", "0.9765625\\0.9765625"),
    us("00280100", 16),
    us("00280101", 12),
    us("00280102", 11),
    us("00280103", 0),
    text("00281050", "DS", "40\\400"),
    text("00281051", "DS", "400\\1500"),
    text("00281052", "DS", "-1024"),
    text("00281053", "DS", "1"),
    text("00281054", "LO", "HU"),
    element("7FE00010", "OW", pixelData(i, 1)),
  ];
  return part10(CT_IMAGE_STORAGE, uid(4, i), body);
}

/** One Per-frame Functional Groups Item: frame content, position, orientation and VOI LUT. */
function perFrameItem(f) {
  const z = (-f * 1.25).toFixed(2);
  return [
    sequence("00209111", [
      [text("00189151", "DT", "20240115092500.000000"), ul("00209157", 1, f + 1)],
    ]),
    sequence("00209113", [[text("00200032", "DS", `-250\\-250\\${z}`)]]),
    sequence("00209116", [[text("00200037", "DS", "1\\0\\0\\0\\1\\0")]]),
    sequence("00289132", [[text("00281050", "DS", "40"), text("00281051", "DS", "400")]]),
  ];
}

/**
 * An Enhanced CT multi-frame object of `frames` 512 by 512 by 16-bit frames: 200 frames is 100 MiB
 * of Pixel Data, with one Per-frame Functional Groups Item a frame.
 */
export function enhancedCt(i, frames) {
  const shared = [
    sequence("00289110", [
      [text("00180050", "DS", "1.25"), text("00280030", "DS", "0.9765625\\0.9765625")],
    ]),
    sequence("00289145", [
      [text("00281052", "DS", "-1024"), text("00281053", "DS", "1"), text("00281054", "LO", "HU")],
    ]),
  ];
  const body = [
    text("00080005", "CS", "ISO_IR 100"),
    text("00080008", "CS", "ORIGINAL\\PRIMARY\\AXIAL\\NONE"),
    text("00080016", "UI", ENHANCED_CT_IMAGE_STORAGE),
    text("00080018", "UI", uid(6, i)),
    text("00080020", "DA", "20240115"),
    text("00080030", "TM", "091500"),
    text("00080050", "SH", `ACC${String(i).padStart(8, "0")}`),
    text("00080060", "CS", "CT"),
    ...equipmentElements(),
    text("0008103E", "LO", "ENHANCED AXIAL"),
    ...privateBlock(i),
    ...patientElements(i),
    text("0020000D", "UI", uid(1, i)),
    text("0020000E", "UI", uid(3, i)),
    text("00200010", "SH", "1"),
    text("00200011", "IS", "1"),
    text("00200013", "IS", "1"),
    text("00200052", "UI", uid(5, i)),
    us("00280002", 1),
    text("00280004", "CS", "MONOCHROME2"),
    text("00280008", "IS", String(frames)),
    us("00280010", 512),
    us("00280011", 512),
    us("00280100", 16),
    us("00280101", 12),
    us("00280102", 11),
    us("00280103", 0),
    sequence("52009229", [shared]),
    sequence(
      "52009230",
      Array.from({ length: frames }, (_v, f) => perFrameItem(f)),
    ),
    element("7FE00010", "OW", pixelData(i, frames)),
  ];
  return part10(ENHANCED_CT_IMAGE_STORAGE, uid(6, i), body);
}

/** One NUM content item with a code, a measured value with its units, and a child CODE item. */
function measurement(k) {
  return [
    text("0040A010", "CS", "CONTAINS"),
    text("0040A040", "CS", "NUM"),
    sequence(
      "0040A043",
      [code(`SYN-${String(k % 500)}`, "99SYNTH", "Synthetic measurement")],
      true,
    ),
    sequence(
      "0040A300",
      [
        [
          sequence("004008EA", [code("mm", "UCUM", "millimeter")], true),
          text("0040A30A", "DS", ((k % 400) / 10 + 1).toFixed(1)),
        ],
      ],
      true,
    ),
    sequence(
      "0040A730",
      [
        [
          text("0040A010", "CS", "HAS CONCEPT MOD"),
          text("0040A040", "CS", "CODE"),
          sequence("0040A043", [code("SYN-SITE", "99SYNTH", "Finding site")], true),
          sequence("0040A168", [code(`SYN-L${String(k % 20)}`, "99SYNTH", "Synthetic site")], true),
        ],
      ],
      true,
    ),
  ];
}

/**
 * A Comprehensive SR document with no Pixel Data: a header, then `measurements` NUM content items
 * under the root container, every sequence and Item of undefined length. About 515 bytes a
 * measurement.
 */
export function srDocument(i, measurements) {
  const body = [
    text("00080005", "CS", "ISO_IR 100"),
    text("00080016", "UI", COMPREHENSIVE_SR_STORAGE),
    text("00080018", "UI", uid(7, i)),
    text("00080020", "DA", "20240115"),
    text("00080023", "DA", "20240115"),
    text("00080030", "TM", "091500"),
    text("00080033", "TM", "101500"),
    text("00080050", "SH", `ACC${String(i).padStart(8, "0")}`),
    text("00080060", "CS", "SR"),
    ...equipmentElements(),
    ...patientElements(i),
    text("0020000D", "UI", uid(1, i)),
    text("0020000E", "UI", uid(8, i)),
    text("00200010", "SH", "1"),
    text("00200011", "IS", "1"),
    text("00200013", "IS", "1"),
    text("0040A040", "CS", "CONTAINER"),
    sequence("0040A043", [code("SYN-REPORT", "99SYNTH", "Synthetic measurement report")], true),
    text("0040A050", "CS", "SEPARATE"),
    text("0040A491", "CS", "COMPLETE"),
    text("0040A493", "CS", "VERIFIED"),
    sequence(
      "0040A730",
      Array.from({ length: measurements }, (_v, k) => measurement(k)),
      true,
    ),
  ];
  return part10(COMPREHENSIVE_SR_STORAGE, uid(7, i), body);
}
