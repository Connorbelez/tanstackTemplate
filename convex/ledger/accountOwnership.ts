export interface LegacyOwnedLedgerAccount {
	_id?: string;
	investorId?: string;
	lenderId?: string;
}

export function getAccountLenderId(
	account: LegacyOwnedLedgerAccount
): string | undefined {
	return account.lenderId ?? account.investorId;
}
