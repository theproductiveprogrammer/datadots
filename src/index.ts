import { appendFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export type Dot<T> = {
	name: string;
	add: (record: T) => void;
	q: (cb: qCallBack<T>) => void;
	close: () => Promise<void>;
};

export type Config<T> = {
	saveEvery: number;
	persister: Persister<T>;
	optimizer?: Optimizer<T>;
};

export type Persister<T> = {
	save: (dbname: string, dotdata: DotData<T>) => Promise<void>;
	load: (dbname: string) => Promise<DotData<T>>;
};

export type Optimizer<T> = (dotdata: DotData<T>) => void;

export type DotData<T> = {
	saved: number;
	records: Array<T>;
	_rollover: boolean;
};

export type qCallBack<T> = (records: Array<T>) => void;

export function memoryPersister<T>(): Persister<T> {
	const mem = {
		saved: [] as Array<T>,
	};
	return {
		save: async (_: string, dotdata: DotData<T>) => {
			mem.saved = mem.saved.concat(dotdata.records.slice(dotdata.saved));
			dotdata.saved = mem.saved.length;
		},
		load: async (_: string) => {
			return {
				saved: mem.saved.length,
				records: mem.saved.concat([]),
				_rollover: false,
			};
		},
	};
}

export function diskPersister<T>(
	o: { raw: boolean } = { raw: false }
): Persister<T> {
	return {
		save: async (dbname: string, dotdata: DotData<T>) => {
			if (dotdata.records.length === 0) return;
			const loc = dirname(dbname);
			if (loc !== "/") await mkdir(loc, { recursive: true });
			let data = "";
			let i = dotdata.saved;
			for (; i < dotdata.records.length; i++) {
				if (o.raw) data += dotdata.records[i] + "\n";
				else data += JSON.stringify(dotdata.records[i]) + "\n";
			}
			if (data) {
				try {
					await appendFile(dbname, data);
					dotdata.saved = i;
				} catch (err) {
					console.error(`error saving ${dbname}`, err);
				}
			}
		},
		load: async (dbname: string) => {
			const ret: DotData<T> = {
				saved: 0,
				records: [],
				_rollover: false,
			};
			try {
				const data = await readFile(dbname, "utf8");
				if (data) {
					const lines = data.split("\n");
					if (o.raw) {
						ret.records = lines as Array<T>;
						if (ret.records.length && !ret.records[ret.records.length - 1]) {
							/* remove last blank */
							ret.records.pop();
						}
					} else {
						lines.forEach((l) => {
							l = l.trim();
							if (!l) return;
							ret.records.push(JSON.parse(l));
						});
					}
					ret.saved = ret.records.length;
				}
			} catch (err: any) {
				if (err.code !== "ENOENT") {
					console.error(err);
				}
			}
			return ret;
		},
	};
}

type DotInfo<T> = {
	name: string;
	dotdata: DotData<T>;
	config: Config<T>;
	writing: boolean;
	lastwrite: number;
};

let DOTS: { [key: string]: DotInfo<any> } = {};
let writer: any;

const WRITE_EVERY = 500;
async function write() {
	const now = Date.now();
	const keys = Object.keys(DOTS);
	for (let i = 0; i < keys.length; i++) {
		const dotinfo = DOTS[keys[i]];
		if (!dotinfo) continue;
		if (now - dotinfo.lastwrite < dotinfo.config.saveEvery * 1000) continue;
		await _write(dotinfo);
	}
	writer = setTimeout(write, WRITE_EVERY);
}

async function _write(dotinfo: DotInfo<any>): Promise<void> {
	if (!dotinfo.writing) {
		dotinfo.writing = true;
		await dotinfo.config.persister.save(dotinfo.name, dotinfo.dotdata);
		dotinfo.writing = false;
	}
}

async function setup<T>(dbname: string, config: Config<T>): Promise<Dot<T>> {
	if (config.saveEvery <= 0) config.saveEvery = 1;
	if (!writer) writer = setTimeout(write, WRITE_EVERY);
	if (DOTS[dbname]) throw new Error(`${dbname} already set up`);
	const dotdata = await config.persister.load(dbname);
	DOTS[dbname] = {
		name: dbname,
		config,
		dotdata,
		writing: false,
		lastwrite: Date.now(),
	};
	return dotFor<T>(dbname);
}

async function shutdown(): Promise<void> {
	if (writer) clearTimeout(writer);
	writer = null;
	const clear_ = DOTS;
	DOTS = {};
	for (let k in clear_) {
		const dotinfo = DOTS[k];
		if (!dotinfo) continue;
		await _write(dotinfo);
	}
}

async function close(dbname: string): Promise<void> {
	const dotinfo = DOTS[dbname];
	if (dotinfo) {
		delete DOTS[dbname];
		await _write(dotinfo);
	}
}

function dotFor<T>(dbname: string): Dot<T> {
	return {
		name: dbname,
		add: (record: T) => add(dbname, record),
		q: (cb: qCallBack<T>) => q(dbname, cb),
		close: async () => close(dbname),
	};
}

function add<T>(dbname: string, record: T): void {
	const dotinfo = DOTS[dbname];
	if (!dotinfo) throw new Error(`${dbname} not set up`);
	dotinfo.dotdata.records.push(record);
	if (dotinfo.config.optimizer) dotinfo.config.optimizer(dotinfo.dotdata);
}

function q<T>(dbname: string, cb: qCallBack<T>) {
	const dotinfo = DOTS[dbname];
	if (!dotinfo) throw new Error(`${dbname} not setup`);
	cb(dotinfo.dotdata.records);
}

const dots = {
	setup,
	shutdown,
};

export default dots;
