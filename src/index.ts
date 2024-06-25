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


export function browserPersister<T>(): Persister<T> {
	const mem = {
		saved: [] as Array<T>,
	};
	return {
		save: async (dbname: string, dotdata: DotData<T>) => {
			mem.saved = mem.saved.concat(dotdata.records.slice(dotdata.saved));
			dotdata.saved = mem.saved.length;
			localStorage.setItem(dbname, JSON.stringify(mem.saved));
		},
		load: async (dbname: string) => {
			const data = localStorage.getItem(dbname);
			try {
				if(data) mem.saved = JSON.parse(data);
			} catch(e) {
				console.error(e);
			}
			return {
				saved: mem.saved.length,
				records: mem.saved.concat([]),
				_rollover: false,
			};
		},
	};
}

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


type DotInfo<T> = {
	name: string;
	dotdata: DotData<T>;
	config: Config<T>;
	writing: boolean;
	lastwrite: number;
};

let DOTS: { [key: string]: DotInfo<any> } = {};
let writer: any;
let stopped = false;

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
	if (!stopped) writer = setTimeout(write, WRITE_EVERY);
}

async function _write(dotinfo: DotInfo<any>): Promise<void> {
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
	} finally {
		dotinfo.writing = false;
	}
}

async function setup<T>(dbname: string, config: Config<T>): Promise<Dot<T>> {
	if (config.saveEvery <= 0) config.saveEvery = 1;
	if (stopped) stopped = false;
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
	stopped = true;
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
		close: async () => await close(dbname),
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
