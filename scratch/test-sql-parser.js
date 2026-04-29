const sql1 = "(153, 'Kurti Collection, New', 'kurti-collection', 'https://example.com/a.png', NULL, NULL, '1', '', 'active', 'active', 'active', NULL, 'active', 'active', 0, NULL, NULL, NULL, NULL, NULL, '2024-07-15 06:35:20', '2025-06-12 05:18:38'),";
const sql2 = "(24, 'Renugambal R', '9042809818', 'Pattern and style choice on all your products are good, quality is more than expectation.. hoping to see different types of collections', 5, 'reject', '2024-12-26 15:28:02', '2024-12-26 15:28:02'),";
const sql3 = "(155, '3 Pieces Kurti Sets', '3-pieces-kurti-sets', 'https://prrayashacollections.com/public/storage/photos/65/Brown Minimal Coming Soon Fashion - Facebook Post (195 x 195 px) (1).png', NULL, NULL, '', '', NULL, NULL, '', NULL, NULL, 'active', 1, 154, 154, NULL, NULL, NULL, '2024-07-15 06:38:19', '2025-03-25 10:13:34'),";

function parseSqlTuple(sqlStr) {
    let s = sqlStr.trim();
    if (s.startsWith('(')) s = s.substring(1);
    if (s.endsWith('),')) s = s.substring(0, s.length - 2);
    else if (s.endsWith(');')) s = s.substring(0, s.length - 2);
    else if (s.endsWith(')')) s = s.substring(0, s.length - 1);

    const values = [];
    let inString = false;
    let buf = '';
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inString) {
            if (escape) {
                if (c === 'n') buf += '\n'; // \n
                else if (c === 'r') buf += '\r';
                else if (c === "'") buf += "'";
                else if (c === "\\") buf += "\\";
                else buf += c;
                escape = false;
            } else if (c === '\\') {
                escape = true;
            } else if (c === "'") {
                if (i + 1 < s.length && s[i+1] === "'") {
                    buf += "'";
                    i++;
                } else {
                    inString = false;
                }
            } else {
                buf += c;
            }
        } else {
            if (c === "'") {
                inString = true;
            } else if (c === ',') {
                values.push(buf.trim() === 'NULL' ? null : buf.trim());
                buf = '';
            } else {
                buf += c;
            }
        }
    }
    values.push(buf.trim() === 'NULL' ? null : buf.trim());
    return values;
}

console.log(parseSqlTuple(sql1));
console.log(parseSqlTuple(sql2));
console.log(parseSqlTuple(sql3));
