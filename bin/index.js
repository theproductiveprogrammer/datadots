export function browserPersister() {
    return {
        save: async (dbname, dotdata) => {
            localStorage.setItem(dbname, JSON.stringify(dotdata));
        },
        load: async (dbname) => {
            const data = localStorage.getItem(dbname);
            let records = [];
            try {
                if (data)
                    records = JSON.parse(data);
            }
            catch (e) {
                console.error(e);
            }
            return {
                saved: 0,
                records: records,
                _rollover: false,
            };
        },
    };
}
export function memoryPersister() {
    const mem = {
        saved: [],
    };
    return {
        save: async (_, dotdata) => {
            mem.saved = mem.saved.concat(dotdata.records.slice(dotdata.saved));
            dotdata.saved = mem.saved.length;
        },
        load: async (_) => {
            return {
                saved: mem.saved.length,
                records: mem.saved.concat([]),
                _rollover: false,
            };
        },
    };
}
let DOTS = {};
let writer;
let stopped = false;
const WRITE_EVERY = 500;
async function write() {
    const now = Date.now();
    const keys = Object.keys(DOTS);
    for (let i = 0; i < keys.length; i++) {
        const dotinfo = DOTS[keys[i]];
        if (!dotinfo)
            continue;
        if (now - dotinfo.lastwrite < dotinfo.config.saveEvery * 1000)
            continue;
        await _write(dotinfo);
    }
    if (!stopped)
        writer = setTimeout(write, WRITE_EVERY);
}
async function _write(dotinfo) {
    if (dotinfo.writing) {
        while (dotinfo.writing) {
            await new Promise((r) => setTimeout(r, 1));
        }
        return;
    }
    dotinfo.writing = true;
    try {
        await dotinfo.config.persister.save(dotinfo.name, dotinfo.dotdata);
        dotinfo.lastwrite = Date.now(); // Update the last write time after successful save
    }
    finally {
        dotinfo.writing = false;
    }
}
async function setup(dbname, config) {
    if (config.saveEvery <= 0)
        config.saveEvery = 1;
    if (stopped)
        stopped = false;
    if (!writer)
        writer = setTimeout(write, WRITE_EVERY);
    if (DOTS[dbname])
        throw new Error(`${dbname} already set up`);
    const dotdata = await config.persister.load(dbname);
    DOTS[dbname] = {
        name: dbname,
        config,
        dotdata,
        writing: false,
        lastwrite: Date.now(),
    };
    return dotFor(dbname);
}
async function shutdown() {
    if (writer)
        clearTimeout(writer);
    writer = null;
    stopped = true;
    const clear_ = DOTS;
    DOTS = {};
    for (let k in clear_) {
        const dotinfo = DOTS[k];
        if (!dotinfo)
            continue;
        await _write(dotinfo);
    }
}
async function close(dbname) {
    const dotinfo = DOTS[dbname];
    if (dotinfo) {
        delete DOTS[dbname];
        await _write(dotinfo);
    }
}
function dotFor(dbname) {
    return {
        name: dbname,
        add: (record) => add(dbname, record),
        q: (cb) => q(dbname, cb),
        close: async () => await close(dbname),
    };
}
function add(dbname, record) {
    const dotinfo = DOTS[dbname];
    if (!dotinfo)
        throw new Error(`${dbname} not set up`);
    dotinfo.dotdata.records.push(record);
    if (dotinfo.config.optimizer)
        dotinfo.config.optimizer(dotinfo.dotdata);
}
function q(dbname, cb) {
    const dotinfo = DOTS[dbname];
    if (!dotinfo)
        throw new Error(`${dbname} not setup`);
    cb(dotinfo.dotdata.records);
}
const dots = {
    setup,
    shutdown,
};
export default dots;
