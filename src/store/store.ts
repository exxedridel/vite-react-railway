import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";

import cotizacionReducer from "@/slices/cotizacionSlice";
import elegirClienteReducer from "@/slices/elegirClienteSlice";
import partyReducer from "@/slices/partySlice";

import { elegirClienteApi } from "@/api/elegirClienteApi";
import { cobranzaApi } from "@/api/cobranzaApi";
import { elegirClienteApiNoToken } from "@/api/elegirClienteApiNoToken";
import { creditsApi } from "@/api/creditsApi";
import { pokeApi } from "@/api/pokeApi";

const rootReducer = combineReducers({
  cotizacion: cotizacionReducer,
  elegirCliente: elegirClienteReducer,
  party: partyReducer,

  [elegirClienteApi.reducerPath]: elegirClienteApi.reducer,
  [cobranzaApi.reducerPath]: cobranzaApi.reducer,
  [elegirClienteApiNoToken.reducerPath]: elegirClienteApiNoToken.reducer,
  [creditsApi.reducerPath]: creditsApi.reducer,
  [pokeApi.reducerPath]: pokeApi.reducer,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["cotizacion", "elegirCliente", "party"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "persist/PERSIST",
          "persist/REHYDRATE",
          "persist/PAUSE",
          "persist/FLUSH",
          "persist/PURGE",
          "persist/REGISTER",
        ],
      },
    }).concat(
      elegirClienteApi.middleware,
      cobranzaApi.middleware,
      elegirClienteApiNoToken.middleware,
      creditsApi.middleware,
      pokeApi.middleware
    ),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;