import { appendFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export default function diskPersister(o = { raw: false }) {
    return {
        save: async (dbname, dotdata) => {
            if (dotdata.records.length <= dotdata.saved)
                return;
            const loc = dirname(dbname);
            if (loc !== "/")
                await mkdir(loc, { recursive: true });
            let data = "";
            let i = dotdata.saved;
            for (; i < dotdata.records.length; i++) {
                if (!i) {
                    if (o.raw)
                        data = dotdata.records[i];
                    else
                        data = JSON.stringify(dotdata.records[i]);
                }
                else {
                    if (o.raw)
                        data += "\n" + dotdata.records[i];
                    else
                        data += "\n" + JSON.stringify(dotdata.records[i]);
                }
            }
            if (data) {
                try {
                    await appendFile(dbname, data);
                    dotdata.saved = i;
                }
                catch (err) {
                    console.error(`error saving ${dbname}`, err);
                }
            }
        },
        load: async (dbname) => {
            const ret = {
                saved: 0,
                records: [],
                _rollover: false,
            };
            try {
                const data = await readFile(dbname, "utf8");
                if (data) {
                    const lines = data.split("\n");
                    if (o.raw) {
                        ret.records = lines;
                        if (ret.records.length && !ret.records[ret.records.length - 1]) {
                            /* remove last blank */
                            ret.records.pop();
                        }
                    }
                    else {
                        lines.forEach((l) => {
                            l = l.trim();
                            if (!l)
                                return;
                            ret.records.push(JSON.parse(l));
                        });
                    }
                    ret.saved = ret.records.length;
                }
            }
            catch (err) {
                if (err.code !== "ENOENT") {
                    console.error(err);
                }
            }
            return ret;
        },
    };
}
