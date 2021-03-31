import util from 'util';
import * as helper from './helper';
import errors from './error-codes';
import { WsClient } from './client';
import { logger } from '@gxchain2/utils';

type HookFunction = (params: any, result: any) => Promise<any> | any;

type JsonRPCBody = { id: any; method: string; jsonrpc: string; params: any };

export interface JsonMiddlewareOption {
  methods: {
    [name: string]: (params: any) => Promise<any> | any;
  };
  beforeMethods?: {
    [name: string]: HookFunction | HookFunction[];
  };
  afterMethods?: {
    [name: string]: HookFunction | HookFunction[];
  };
  onError?: (err: any, body: JsonRPCBody) => void;
}

export class JsonRPCMiddleware {
  private readonly config: JsonMiddlewareOption;
  private readonly VERSION = '2.0';

  constructor(config: JsonMiddlewareOption) {
    helper.validateConfig(config);
    this.config = config;
  }

  /**
   * JSON RPC request handler
   * @param {object} body
   * @return {Promise}
   */
  async handleSingleReq(body: JsonRPCBody): Promise<any> {
    const { id, method, jsonrpc, params } = body;
    try {
      helper.validateJsonRpcVersion(jsonrpc, this.VERSION);

      helper.validateJsonRpcMethod(method, this.config.methods);
      logger.info('📦 Rpc served', method);
      const beforeMethod = this.config.beforeMethods && this.config.beforeMethods[method];
      if (beforeMethod) {
        await helper.executeHook(beforeMethod, params, null);
      }

      const p = this.config.methods[method](params);
      const result = util.types.isPromise(p) ? await p : p;
      const afterMethod = this.config.afterMethods && this.config.afterMethods[method];
      if (afterMethod) {
        await helper.executeHook(afterMethod, params, result);
      }

      if (!helper.isNil(id)) return { jsonrpc, result, id };
    } catch (err) {
      if (helper.isFunction(this.config.onError)) this.config.onError && this.config.onError(err, body);
      const error = {
        code: Number(err.code || err.status || errors.INTERNAL_ERROR.code),
        message: err.message || errors.INTERNAL_ERROR.message,
        data: undefined
      };
      if (err && err.data) error.data = err.data;
      return { jsonrpc, error, id };
    }
  }

  handleBatchReq(bachBody: Array<any>): Promise<any> {
    return Promise.all(
      bachBody.reduce((memo, body) => {
        const result = this.handleSingleReq(body);
        if (!helper.isNil(body.id)) memo.push(result);
        return memo;
      }, [])
    );
  }

  private makeParseError() {
    return {
      jsonrpc: this.VERSION,
      error: errors.PARSE_ERROR
    };
  }

  async rpcMiddleware(rpcData: any, send: (res: any) => void) {
    if (Array.isArray(rpcData)) {
      send(await this.handleBatchReq(rpcData));
    } else if (typeof rpcData === 'object') {
      send(await this.handleSingleReq(rpcData));
    } else {
      send(this.makeParseError());
    }
  }

  wrapWs(wsClient: WsClient) {
    wsClient.ws.addEventListener('message', (msg) => {
      let rpcData: any;
      try {
        rpcData = JSON.parse(msg.data);
      } catch (err) {
        wsClient.send(this.makeParseError());
        return;
      }
      this.rpcMiddleware(rpcData, wsClient.send.bind(wsClient));
    });
  }

  makeMiddleWare() {
    return (req: any, res: any, next: any) => {
      if (req.ws) {
        next();
      } else {
        this.rpcMiddleware(req.body, res.send.bind(res));
      }
    };
  }
}
