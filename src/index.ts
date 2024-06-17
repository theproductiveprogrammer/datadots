export type Config = {
	saveEvery: number;
	persister: Persister;
	processor: Processor;
};

export type Persister = {
	save: (dotdata: DotData) => void;
	load: () => DotData;
};

export type DotData = {
	saved: number;
	records: Array<Record>;
	_rollover: boolean;
};

export type Record = Array<string>;

export type Processor = (dotdata: DotData) => void;

export function memoryPersister(): Persister {
	const mem = {
		saved: [] as Array<Record>,
	};
	return {
		save: (dotdata: DotData) => {
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
};

let DOTS: { [key: string]: DotInfo } = {};

function add(dbname: string, record: Record): void {
	const dotinfo = DOTS[dbname];
	if (!dotinfo) throw new Error(`${dbname} not setup`);
	dotinfo.dotdata.records.push(record);
	dotinfo.config.processor(dotinfo.dotdata);
}

function setup(dbname: string, config: Config): void {
	if (DOTS[dbname]) throw new Error(`${dbname} already set up`);
	DOTS[dbname] = {
		config,
		dotdata: config.persister.load(),
	};
	config.processor(DOTS[dbname].dotdata);
}

function shutdown() {
	DOTS = {};
}

const dots = {
	setup,
	add,
	shutdown,
};

export default dots;
