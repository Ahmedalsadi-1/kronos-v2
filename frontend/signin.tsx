// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SignIn1 } from "@/app/components/ui/modern-stunning-sign-in";
import { createRoot } from "react-dom/client";
import "./tailwindsetup.css";

createRoot(document.getElementById("signin-root")).render(<SignIn1 onClose={() => window.close()} />);
