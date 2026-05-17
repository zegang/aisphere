export class ServiceContainer {
  private static instance: ServiceContainer;
  private services: Map<string, any> = new Map();
  private registrationOrder: string[] = [];

  private constructor() {}

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  register(name: string, service: any): void {
    if (this.services.has(name)) {
      console.warn(`Service ${name} is already registered.`);
      return;
    }

    this.registrationOrder.push(name);
    this.services.set(name, service);
    if (service.init) {
      try {
        service.init();
      } catch (e) {
        console.error(`Failed to init service ${name}:`, e);
      }
    }
  }

  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service ${name} not found`);
    return service as T;
  }

  async shutdownAllService(): Promise<void> {
    console.log('🛑 Starting shutdown sequence...');
    const shutdownSequence = [...this.registrationOrder].reverse();

    for (const name of shutdownSequence) {
      const service = this.services.get(name);
      
      if (service && service.shutdown) {
        try {
          console.log(`Shutting down service: ${name}...`);
          await service.shutdown(); 
          console.log(`✅ Service ${name} shut down successfully.`);
        } catch (error) {
          console.error(`❌ Error shutting down service ${name}:`, error);
        }
      }
    }

    this.services.clear();
    this.registrationOrder = [];
    console.log('🏁 All services shut down.');
  }

}