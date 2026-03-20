// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

import Foundation
import UIKit

enum InvokeError: Error {
  case invalidPayload(String)
}

@objc public class Invoke: NSObject {
  public let command: String
  let callback: UInt64
  let error: UInt64
  let data: String
  let sendResponse: (UInt64, String?) -> Void
  let sendChannelData: (UInt64, String) -> Void

  public init(
    command: String, callback: UInt64, error: UInt64,
    sendResponse: @escaping (UInt64, String?) -> Void,
    sendChannelData: @escaping (UInt64, String) -> Void, data: String
  ) {
    self.command = command
    self.callback = callback
    self.error = error
    self.data = data
    self.sendResponse = sendResponse
    self.sendChannelData = sendChannelData
  }

  public func getRawArgs() -> String {
    return self.data
  }

  public func getArgs() throws -> JSObject {
    guard let jsonData = self.data.data(using: .utf8) else {
      throw InvokeError.invalidPayload("args string is not valid UTF-8")
    }
    let raw = try JSONSerialization.jsonObject(with: jsonData, options: [])
    guard let dict = raw as? NSDictionary else {
      throw InvokeError.invalidPayload("args payload is not a JSON object")
    }
    guard let result = JSTypes.coerceDictionaryToJSObject(dict, formattingDatesAsStrings: true)
    else {
      throw InvokeError.invalidPayload("args object could not be coerced to JSObject")
    }
    return result
  }

  public func parseArgs<T: Decodable>(_ type: T.Type) throws -> T {
    guard let jsonData = self.data.data(using: .utf8) else {
      throw InvokeError.invalidPayload("args string is not valid UTF-8")
    }
    let decoder = JSONDecoder()
    decoder.userInfo[channelDataKey] = sendChannelData
    return try decoder.decode(type, from: jsonData)
  }

  func serialize(_ data: JsonValue) -> String {
    do {
      return try data.jsonRepresentation() ?? "\"Failed to serialize payload\""
    } catch {
      return "\"Failed to serialize payload\""
    }
  }

  public func resolve() {
    sendResponse(callback, nil)
  }

  public func resolve(_ data: JsonObject) {
    resolve(.dictionary(data))
  }

  public func resolve(_ data: JsonValue) {
    sendResponse(callback, serialize(data))
  }

  public func resolve<T: Encodable>(_ data: T) {
    do {
      let json = try JSONEncoder().encode(data)
      sendResponse(callback, String(decoding: json, as: UTF8.self))
    } catch {
      sendResponse(self.error, "\"Failed to encode response payload\"")
    }
  }

  public func reject(
    _ message: String, code: String? = nil, error: Error? = nil, data: JsonValue? = nil
  ) {
    let payload: NSMutableDictionary = [
      "message": message
    ]

    if let code = code {
      payload["code"] = code
    }

    if let error = error {
      payload["error"] = error.localizedDescription
    }

    if let data = data {
      switch data {
      case .dictionary(let dict):
        for entry in dict {
          payload[entry.key] = entry.value
        }
      }
    }

    sendResponse(self.error, serialize(.dictionary(payload as! JsonObject)))
  }

  public func unimplemented() {
    unimplemented("not implemented")
  }

  public func unimplemented(_ message: String) {
    reject(message)
  }

  public func unavailable() {
    unavailable("not available")
  }

  public func unavailable(_ message: String) {
    reject(message)
  }
}
