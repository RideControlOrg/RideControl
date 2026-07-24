import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { DEFAULT_RIDER_PROFILE, loadRiderProfile, saveRiderProfile } from '../src/lib/profile';

describe('rider profile IndexedDB history', () => {
	test('persists the first weight and appends only real changes', async () => {
		const first = await saveRiderProfile(DEFAULT_RIDER_PROFILE, 1000);
		expect(first.weightHistory).toEqual([{ recordedAt: 1000, weightKg: 75 }]);

		const unchanged = await saveRiderProfile({ ...first, name: 'Riley' }, 2000);
		expect(unchanged.weightHistory).toEqual(first.weightHistory);

		const changed = await saveRiderProfile({ ...unchanged, riderWeightKg: 74.5 }, 3000);
		expect(changed.weightHistory).toEqual([
			{ recordedAt: 1000, weightKg: 75 },
			{ recordedAt: 3000, weightKg: 74.5 },
		]);
		expect((await loadRiderProfile()).weightHistory).toEqual(changed.weightHistory);
	});
});
