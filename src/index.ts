export type Config = {
	saveEvery: number;
	persister: Persister;
	processor: Processor;
};

export type Persister = {
	save: (dotdata: DotData) => Promise<void>;
	load: () => DotData;
};

export type DotData = {
	saved: number;
	records: Array<Record>;
	_rollover: boolean;
};

export type Record = Array<string>;

export type Processor = (dotdata: DotData) => void;

export type qCallBack = (dotdata: DotData) => void;

export function memoryPersister(): Persister {
	const mem = {
		saved: [] as Array<Record>,
	};
	return {
		save: async (dotdata: DotData) => {
			mem.saved = mem.saved.concat(dotdata.records.slice(dotdata.saved));
			dotdata.saved = mem.saved.length;
		},
		load: (): DotData => {
			return {
				saved: mem.saved.length,
				records: mem.saved.concat([]),
				_rollover: false,
			};
		},
	};
}

export function justCompress(_: DotData) {}

export function recordFrom(o: any): Record {
	return ["", "" + o.id];
}

type DotInfo = {
	dotdata: DotData;
	config: Config;
	lastwrite: number;
};

let DOTS: { [key: string]: DotInfo } = {};
let writer: any;

async function write() {
	const now = Date.now();
	const keys = Object.keys(DOTS);
	for (let i = 0; i < keys.length; i++) {
		const dotinfo = DOTS[keys[i]];
		if (!dotinfo) continue;
		if (now - dotinfo.lastwrite < dotinfo.config.saveEvery * 1000) continue;
		await dotinfo.config.persister.save(dotinfo.dotdata);
	}
	writer = setTimeout(write, 500);
}

function add(dbname: string, record: Record): void {
	const dotinfo = DOTS[dbname];
	if (!dotinfo) throw new Error(`${dbname} not setup`);
	dotinfo.dotdata.records.push(record);
	dotinfo.config.processor(dotinfo.dotdata);
}

function setup(dbname: string, config: Config): void {
	if (DOTS[dbname]) throw new Error(`${dbname} already set up`);
	if (!writer) writer = setTimeout(write, 500);
	DOTS[dbname] = {
		config,
		dotdata: config.persister.load(),
		lastwrite: Date.now(),
	};
	config.processor(DOTS[dbname].dotdata);
}

function shutdown() {
	if (writer) clearTimeout(writer);
	writer = null;
	DOTS = {};
}

function q(dbname: string, cb: qCallBack) {
	const dotinfo = DOTS[dbname];
	if (!dotinfo) throw new Error(`${dbname} not setup`);
	cb(dotinfo.dotdata);
}

const dots = {
	setup,
	add,
	q,
	shutdown,
};

export default dots;
