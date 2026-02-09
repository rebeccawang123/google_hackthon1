
import { ResolutionResult } from "../types";

const STORAGE_KEY = 'base_id_vault';

// Hardcoded project accounts with verified registration hashes and agent IDs
const PROJECT_ACCOUNTS: ResolutionResult[] = [
  {
    "id": "test@example.com-1770489823651",
    "address": "0xF0776070818b74364196BA60c06c2b0F90b4C3C9",
    "privateKey": "0xa01fbef45a2d33021eef99e7c0598136c18880a5f9d35180a6596f49b73f8747",
    "email": "test@example.com",
    "description": "This is just a testing agent.",
    "timestamp": "2026-02-07T18:43:43.651Z",
    "network": "Base Sepolia",
    "agentId": 2377 
  },
  {
    "id": "feedback@example.com-1770535327154",
    "address": "0x54E91D9f2349b58dc0FC2Fe91362Ddc1B36FEE27",
    "privateKey": "0xcbdff9ec440a647c7a40dedf87674f72c601badc5513d1608009d04c949207cb",
    "email": "feedback@example.com",
    "description": "This is a feedback account.",
    "timestamp": "2026-02-08T07:22:07.154Z",
    "network": "Base Sepolia",
    "agentId": 2379
  },
  {
    "id": "landlord@gmail.com-1770636305133",
    "address": "0xccf45191a79A11622fc260AB03143C6275D2d249",
    "privateKey": "0xafa81498c73923a66a3756b88c00838a26ec46dfd27671afaba03cf30e0a1598",
    "email": "alex.landlord@gmail.com",
    "description": "landlord alex",
    "timestamp": "2026-02-09T11:25:05.133Z",
    "network": "Base Sepolia",
    "agentId": 2438
  },
  {
    "id": "merchant@gmail.com-1770636426526",
    "address": "0x7e26728E8ea9e72D98CfDc17Ad8aA12Cf08a8725",
    "privateKey": "0xa2d9bac90b63645a011da10e0ae08e76bf8067ced93aeebf29aca7ec86968f7f",
    "email": "maria.merchant@gmail.com",
    "description": "merchant maria",
    "timestamp": "2026-02-09T11:27:06.526Z",
    "network": "Base Sepolia",
    "agentId": 2439
  },
  {
    "id": "tenant@gmail.com-1770636484409",
    "address": "0x4396432B088e541FC5A3EE7A1B6FdC30507b9247",
    "privateKey": "0xb5b3ebd7de073bd72912df01f71982ec964ac396174ba39901b0789f4af52e11",
    "email": "tom.tenant@gmail.com",
    "description": "tenant tom",
    "timestamp": "2026-02-09T11:28:04.409Z",
    "network": "Base Sepolia",
    "agentId": 2440
  },
  {
    "id": "safety.sentinel@gmail.com-1770636548178",
    "address": "0x7eaBd2e6dfc68119C7577a0EfeE225E7FD148e33",
    "privateKey": "0xefddacd6e8b861a27dc4d7e81f7e02b0e76f3996b26ccc5cd6771674383b1afd",
    "email": "safety.sentinel@gmail.com",
    "description": "safety agent",
    "timestamp": "2026-02-09T11:29:08.178Z",
    "network": "Base Sepolia",
    "agentId": 2441
  },
  {
    "id": "settle.mediator@gmail.com-1770636620686",
    "address": "0x2C7fA0FCEB8877c8B00d8fa72e37eA831082ecD5",
    "privateKey": "0x44f4f085f304a8e0ffbf9c7eac4b795e2fe8ba3c1c07cd00922acff4fb73cdd9",
    "email": "settle.mediator@gmail.com",
    "description": "settle agent",
    "timestamp": "2026-02-09T11:30:20.686Z",
    "network": "Base Sepolia",
    "agentId": 2442
  }
];

export interface ExtendedResolutionResult extends ResolutionResult {
  source: 'project' | 'session';
}

export class IdentityDatabase {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private async _performInit(): Promise<void> {
    try {
      const mergedMap = new Map<string, ExtendedResolutionResult>();
      const localData = this.getLocalStore();
      
      localData.forEach(item => {
        if (item.source === 'session') mergedMap.set(item.email.toLowerCase(), { ...item });
      });
      
      PROJECT_ACCOUNTS.forEach((fileItem) => {
        if (!fileItem.email) return;
        mergedMap.set(fileItem.email.toLowerCase(), { ...fileItem, source: 'project' });
      });
      
      this.saveLocalStore(Array.from(mergedMap.values()));
      this.initialized = true;
    } catch (e) {
      console.error("IdentityDatabase: Init error", e);
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  private getLocalStore(): ExtendedResolutionResult[] {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveLocalStore(identities: ExtendedResolutionResult[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identities));
  }

  async saveIdentity(identity: ResolutionResult): Promise<void> {
    await this.init();
    const identities = await this.getAllIdentities();
    const index = identities.findIndex(i => i.email.toLowerCase() === identity.email.toLowerCase());
    const entry: ExtendedResolutionResult = { ...identity, source: 'session' };
    if (index > -1) identities[index] = entry; else identities.unshift(entry);
    this.saveLocalStore(identities);
  }

  async updateIdentityMetadata(email: string, metadataUpdates: Partial<ResolutionResult['metadata']>): Promise<void> {
    await this.init();
    const identities = await this.getAllIdentities();
    const index = identities.findIndex(i => i.email.toLowerCase() === email.toLowerCase());
    if (index > -1) {
      identities[index].metadata = {
        ...(identities[index].metadata || {} as any),
        ...metadataUpdates
      };
      // Synchronize root agentId if present in updates
      if (metadataUpdates.agentId) {
        identities[index].agentId = metadataUpdates.agentId;
      }
      this.saveLocalStore(identities);
    }
  }

  async getAllIdentities(): Promise<ExtendedResolutionResult[]> {
    await this.init();
    return this.getLocalStore();
  }

  async findByEmail(email: string): Promise<ExtendedResolutionResult | null> {
    const identities = await this.getAllIdentities();
    return identities.find(i => i.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findByAddress(address: string): Promise<ExtendedResolutionResult | null> {
    const identities = await this.getAllIdentities();
    return identities.find(i => i.address.toLowerCase() === address.toLowerCase()) || null;
  }

  async deleteIdentity(email: string): Promise<void> {
    const identities = await this.getAllIdentities();
    this.saveLocalStore(identities.filter(i => i.email.toLowerCase() !== email.toLowerCase()));
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    this.initialized = false;
    await this.init();
  }
}

export const db = new IdentityDatabase();

