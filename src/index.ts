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
		load: () => {
			return {
				saved: mem.saved.length,
				records: mem.saved.concat([]),
				_rollover: false,
			};
		},
	};
}

export function justCompress(dotdata: DotData) {}

export function recordFrom(o: any): Record {
	return [];
}

const dots = {
	setup: (dbname: string, config: Config): void => {},
	add: (dbname: string, record: Record): void => {},
	shutdown: (): void => {},
};

export default dots;
