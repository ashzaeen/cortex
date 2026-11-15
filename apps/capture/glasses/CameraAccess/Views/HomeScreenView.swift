/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

//
// HomeScreenView.swift
//
// Welcome screen that guides users through the DAT SDK registration process.
// This view is displayed when the app is not yet registered.
//

import MWDATCore
import SwiftUI

struct HomeScreenView: View {
  var viewModel: WearablesViewModel

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.03, green: 0.08, blue: 0.06), Color(red: 0.07, green: 0.18, blue: 0.14)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .edgesIgnoringSafeArea(.all)

      Circle()
        .fill(Color(red: 0.82, green: 0.66, blue: 0.38).opacity(0.14))
        .frame(width: 320, height: 320)
        .blur(radius: 70)
        .offset(x: 130, y: -260)

      VStack(spacing: 20) {
        Spacer()

        Image("CorneaLogo")
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(width: 132, height: 132)
          .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
              .stroke(Color.white.opacity(0.14), lineWidth: 1)
          }
          .shadow(color: Color.black.opacity(0.35), radius: 24, y: 12)

        VStack(spacing: 6) {
          Text("CORNEA")
            .font(.system(size: 28, weight: .bold, design: .rounded))
            .tracking(5)
            .foregroundStyle(Color(red: 0.93, green: 0.91, blue: 0.83))
          Text("The eyes of your second brain")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Color(red: 0.82, green: 0.66, blue: 0.38))
        }

        VStack(spacing: 12) {
          TipRow(
            resource: .smartGlassesIcon,
            title: "Start a session",
            text: "Connect to your glasses to get started."
          )
          TipRow(
            resource: .videoIcon,
            title: "Start preview",
            text: "See the live camera feed from your glasses."
          )
          TipRow(
            resource: .tapIcon,
            title: "Capture",
            text: "Take photos and record video with audio from your glasses' microphone."
          )
        }
        .padding(18)
        .background(.ultraThinMaterial.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 24, style: .continuous)
            .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }

        Spacer()

        VStack(spacing: 20) {
          Text("You'll be redirected to the Meta AI app to confirm your connection.")
            .font(.system(size: 14))
            .foregroundStyle(Color.white.opacity(0.68))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)

          CustomButton(
            title: viewModel.registrationState == .registering ? "Connecting…" : "Connect my glasses",
            style: .primary,
            isDisabled: viewModel.registrationState == .registering
          ) {
            viewModel.connectGlasses()
          }
        }
      }
      .padding(.all, 24)
    }
  }
}
